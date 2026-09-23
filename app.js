const state = { index: [], current: null, view: "today", mistakes: loadMistakes() };
const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

function loadMistakes() { try { return JSON.parse(localStorage.getItem("n2-mistakes-v1")) || {}; } catch { return {}; } }
function saveMistakes() { localStorage.setItem("n2-mistakes-v1", JSON.stringify(state.mistakes)); updateCount(); }
function updateCount() { const count = Object.keys(state.mistakes).length; $("#review-count").textContent = count; $("#review-count").hidden = count === 0; }
function showStatus(message) { $("#status").textContent = message; $("#status").hidden = false; }
function hideStatus() { $("#status").hidden = true; }
function setActive(view) { document.querySelectorAll(".nav-item").forEach(node => node.classList.toggle("active", node.dataset.view === view)); document.querySelectorAll(".history-item").forEach(node => node.classList.toggle("active", view === "lesson" && node.dataset.date === state.current?.date)); }

async function getJSON(path) { const response = await fetch(path, { cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }

async function showLesson(date, view = "lesson") {
  state.view = view;
  $("#review-view").hidden = true; $("#lesson-view").hidden = true;
  showStatus("正在加载练习…");
  try {
    const lesson = await getJSON(`./data/${date}.json`);
    if (!Array.isArray(lesson.questions) || !Array.isArray(lesson.points)) throw new Error("练习数据格式有误");
    state.current = lesson;
    renderLesson(lesson);
    setActive(view);
    hideStatus(); $("#lesson-view").hidden = false;
    if (view === "lesson") history.replaceState(null, "", `#${date}`); else history.replaceState(null, "", location.pathname + location.search);
  } catch (error) { showStatus(`练习暂时无法加载：${error.message}。请确认文件齐全，并通过本地服务器或 GitHub Pages 打开网页。`); }
}

function renderLesson(lesson) {
  $("#hero-date").textContent = lesson.date;
  $("#hero-duration").textContent = lesson.duration || "约 10 分钟";
  $("#hero-kicker").textContent = lesson.kicker || "TODAY'S GRAMMAR";
  $("#hero-title").textContent = lesson.title;
  $("#hero-subtitle").textContent = lesson.subtitle;
  const tags = $("#hero-tags"); tags.replaceChildren(...lesson.tags.map(tag => el("span", "tag", tag)));
  const points = $("#lesson-points"); points.replaceChildren(...lesson.points.map((point, i) => {
    const card = el("article", "point"); card.append(el("p", "point-label", `POINT ${String(i+1).padStart(2,"0")}`), el("h3", "", point.term), el("p", "", point.meaning), el("p", "point-example", point.example)); return card;
  }));
  $("#question-progress").textContent = `共 ${lesson.questions.length} 题`;
  $("#questions").replaceChildren(...lesson.questions.map((question, i) => renderQuestion(question, i, lesson)));
  $("#takeaway").replaceChildren(el("p", "", lesson.takeaway), el("small", "", lesson.takeawayNote || ""));
}

function renderQuestion(question, index, lesson) {
  const card = el("article", "question-card");
  const top = el("div", "question-top"); top.append(el("span", "", `QUESTION ${String(index+1).padStart(2,"0")}`), el("span", "", question.tag || "语法选择")); card.append(top);
  card.append(el("p", "question-prompt", question.prompt), el("p", "question-jp", question.sentence));
  const choices = el("div", "choices"); const feedback = el("span", "feedback"); const answer = el("div", "answer"); answer.hidden = true;
  const answerLabel = el("strong", "", `答案：${question.options[question.answer]}`); answer.append(answerLabel, el("p", "", question.explanation));
  question.options.forEach((option, choiceIndex) => {
    const button = el("button", "choice", `${String.fromCharCode(65+choiceIndex)}. ${option}`); button.type = "button";
    button.addEventListener("click", () => {
      choices.querySelectorAll("button").forEach((item, i) => { item.classList.toggle("selected", i === choiceIndex); item.classList.toggle("correct", i === question.answer); item.classList.toggle("incorrect", i === choiceIndex && i !== question.answer); });
      answer.hidden = false; toggle.textContent = "收起解析"; toggle.setAttribute("aria-expanded", "true");
      const correct = choiceIndex === question.answer;
      feedback.className = `feedback ${correct ? "good" : "bad"}`;
      feedback.textContent = correct ? "答对了 ✓" : "再记住这个区别";
      if (!correct) { state.mistakes[`${lesson.date}:${question.id}`] = { date: lesson.date, id: question.id, title: lesson.title, prompt: question.prompt, sentence: question.sentence, answer: question.options[question.answer], explanation: question.explanation }; saveMistakes(); review.textContent = "已加入复习 ✓"; }
    }); choices.append(button);
  }); card.append(choices);
  const actions = el("div", "question-actions"); const toggle = el("button", "answer-toggle", "查看答案与解析"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => { answer.hidden = !answer.hidden; toggle.textContent = answer.hidden ? "查看答案与解析" : "收起解析"; toggle.setAttribute("aria-expanded", String(!answer.hidden)); });
  const review = el("button", "review-toggle", state.mistakes[`${lesson.date}:${question.id}`] ? "已加入复习 ✓" : "加入复习"); review.type = "button";
  review.addEventListener("click", () => { const key = `${lesson.date}:${question.id}`; if (state.mistakes[key]) { delete state.mistakes[key]; review.textContent = "加入复习"; } else { state.mistakes[key] = { date: lesson.date, id: question.id, title: lesson.title, prompt: question.prompt, sentence: question.sentence, answer: question.options[question.answer], explanation: question.explanation }; review.textContent = "已加入复习 ✓"; } saveMistakes(); });
  actions.append(toggle, feedback, review); card.append(actions, answer); return card;
}

function renderHistory() {
  $("#history-count").textContent = `${Math.max(0, state.index.length-1)} 天`;
  $("#history-list").replaceChildren(...state.index.slice(1).map(item => { const button = el("button", "history-item"); button.type = "button"; button.dataset.date = item.date; button.append(el("span", "history-date", item.date.slice(5).replace("-", "/")), el("span", "history-title", item.title)); button.addEventListener("click", () => showLesson(item.date)); return button; }));
}

function showReview() {
  state.view = "review"; $("#lesson-view").hidden = true; $("#review-view").hidden = false; hideStatus(); setActive("review"); history.replaceState(null, "", "#review");
  const entries = Object.entries(state.mistakes).sort((a,b) => b[1].date.localeCompare(a[1].date));
  $("#review-items").replaceChildren(...(entries.length ? entries.map(([key,item]) => { const card = el("article", "review-card"); card.append(el("div", "question-top", `${item.date} · ${item.title}`), el("h3", "", item.prompt), el("p", "", item.sentence), el("p", "", `答案：${item.answer}。${item.explanation}`)); const done = el("button", "", "已掌握 · 移出复习"); done.type = "button"; done.addEventListener("click", () => { delete state.mistakes[key]; saveMistakes(); showReview(); }); card.append(done); return card; }) : [el("div", "empty-review", "这里还没有错题。答错或点击「加入复习」后，就能在这里回顾。")]));
}

async function init() {
  updateCount();
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => button.dataset.view === "review" ? showReview() : showLesson(state.index[0].date, "today")));
  try { const manifest = await getJSON("./data/index.json"); state.index = manifest.lessons; if (!Array.isArray(state.index) || !state.index.length) throw new Error("索引为空"); renderHistory(); const hash = location.hash.slice(1); if (hash === "review") showReview(); else { const found = state.index.find(item => item.date === hash); await showLesson(found?.date || state.index[0].date, found ? "lesson" : "today"); } }
  catch (error) { showStatus(`无法读取练习索引：${error.message}。请通过本地服务器或 GitHub Pages 打开网页。`); }
}
init();
