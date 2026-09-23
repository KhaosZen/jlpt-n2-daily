"use strict";

const TIME_ZONE = "Asia/Shanghai";
const STORAGE_KEY = "n2-progress-v2";
const $ = (selector) => document.querySelector(selector);
const state = { lessons: [], current: null, activeExercises: [], progress: loadProgress(), today: todayInTimeZone(), openMonths: new Set() };
state.openMonths.add(state.today.slice(0, 7));

function emptyProgress() {
  return { version: 2, completedDates: {}, attempts: {}, grammarStats: {}, dailySelections: {} };
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 2 && saved.completedDates && saved.attempts && saved.grammarStats) {
      saved.dailySelections ||= {};
      return saved;
    }
  } catch { /* Damaged or unavailable storage starts a fresh local record. */ }
  return emptyProgress();
}

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); }
  catch { showStatus("浏览器未允许保存学习记录；本次答题仍可继续。", false); }
  window.CloudSync?.changed();
}

function todayInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// JSON uses 漢字{かんじ}; only explicit annotations become ruby elements.
function richNode(tag, className, source) {
  const element = node(tag, className);
  const text = String(source ?? "");
  const pattern = /([\u3400-\u9fff々〆ヶ]+)\{([ぁ-んァ-ヶー]+)\}/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(cursor, match.index)));
    const ruby = document.createElement("ruby");
    ruby.append(document.createTextNode(match[1]), node("rp", "", "("), node("rt", "", match[2]), node("rp", "", ")"));
    element.append(ruby);
    cursor = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(cursor)));
  return element;
}

function plainJapanese(text) {
  return String(text).replace(/([\u3400-\u9fff々〆ヶ]+)\{[ぁ-んァ-ヶー]+\}/g, "$1");
}

function normalizedAnswer(text) {
  return plainJapanese(text).trim().replace(/[\s\u3000]+/g, "").replace(/[。．.!！?？]+$/, "");
}

function formatDate(date) { return date.replaceAll("-", "/"); }
function showStatus(message, loading = true) { $("#status").textContent = message; $("#status").hidden = false; $("#status").dataset.loading = String(loading); }
function hideStatus() { $("#status").hidden = true; }

async function getJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function todayLesson() {
  return state.lessons.find(item => item.date === state.today)
    || state.lessons.find(item => item.date < state.today)
    || state.lessons[0];
}

function renderHistory() {
  $("#history-count").textContent = `${state.lessons.length} 天`;
  const months = new Map();
  for (const item of state.lessons) {
    const month = item.date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(item);
  }
  $("#history-list").replaceChildren(...[...months].map(([month, lessons]) => {
    const group = node("div", "history-month");
    const toggle = node("button", "month-toggle");
    const panel = node("div", "month-lessons");
    toggle.type = "button";
    toggle.id = `month-toggle-${month}`;
    toggle.setAttribute("aria-controls", `month-lessons-${month}`);
    toggle.setAttribute("aria-expanded", String(state.openMonths.has(month)));
    toggle.append(node("span", "month-label", `${month.slice(0, 4)}年${month.slice(5)}月`),
      node("span", "month-count", `${lessons.length} 天`));
    panel.id = `month-lessons-${month}`;
    panel.setAttribute("aria-labelledby", toggle.id);
    panel.hidden = !state.openMonths.has(month);
    panel.append(...lessons.map(item => {
      const button = node("button", "history-item");
      button.type = "button";
      button.dataset.date = item.date;
      const completed = Boolean(state.progress.completedDates[item.date]);
      button.setAttribute("aria-label", `${formatDate(item.date)} ${item.title} ${completed ? "已完成" : "未完成"}`);
      button.append(node("span", "history-date", item.date.slice(5).replace("-", "/")),
        node("span", "history-title", item.title),
        node("span", "history-state", completed ? "✓ 已完成" : "未完成"));
      button.classList.toggle("active", state.current?.date === item.date);
      button.addEventListener("click", () => openLesson(item.date, false));
      return button;
    }));
    toggle.addEventListener("click", () => {
      const open = !state.openMonths.has(month);
      if (open) state.openMonths.add(month);
      else state.openMonths.delete(month);
      toggle.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
    });
    group.append(toggle, panel);
    return group;
  }));
}

function recordAttempt(exercise, answer, isCorrect) {
  const date = state.current.date;
  const attempts = state.progress.attempts[date] ||= {};
  const previous = attempts[exercise.id];
  if (previous && previous.answer === answer && previous.isCorrect === isCorrect) return;
  if (previous) {
    for (const point of previous.grammarPoints) {
      const stats = state.progress.grammarStats[point];
      if (stats) { stats.attempts = Math.max(0, stats.attempts - 1); if (!previous.isCorrect) stats.errors = Math.max(0, stats.errors - 1); }
    }
  }
  for (const point of exercise.grammar_points) {
    const stats = state.progress.grammarStats[point] ||= { attempts: 0, errors: 0 };
    stats.attempts++;
    if (!isCorrect) stats.errors++;
  }
  attempts[exercise.id] = { answer, isCorrect, grammarPoints: [...exercise.grammar_points], updatedAt: new Date().toISOString() };
  saveProgress();
  updateCompletion();
}

function updateCompletion() {
  if (!state.current) return;
  const attempts = state.progress.attempts[state.current.date] || {};
  const done = state.activeExercises.filter(item => typeof attempts[item.id]?.isCorrect === "boolean").length;
  const total = state.activeExercises.length;
  $("#question-progress").textContent = `${done}/${total} 题已记录`;
  const completed = Boolean(state.progress.completedDates[state.current.date]);
  $("#complete-button").disabled = done !== total || completed;
  $("#complete-button").textContent = completed ? "✓ 已完成" : "今日の練習を完了";
  $("#completion-hint").textContent = completed ? "学习记录已保存；登录后也会同步到其他设备。" : done === total ? "全部题目已记录，可以完成今天的练习。" : `还差 ${total - done} 题。查看答案后记录答题结果。`;
  renderHistory();
}

function renderExercise(exercise, index) {
  const card = node("article", "question-card");
  const top = node("div", "question-top");
  const typeLabel = { multiple_choice: "选择题", fill_blank: "填空题", rewrite: "改写题" }[exercise.type];
  top.append(node("span", "", `QUESTION ${String(index + 1).padStart(2, "0")}`), node("span", "", typeLabel));
  card.append(top, node("p", "question-prompt", exercise.prompt));
  if (exercise.jp) card.append(richNode("p", "question-jp", exercise.jp));
  if (exercise.source) card.append(richNode("p", "rewrite-source", exercise.source));

  const old = state.progress.attempts[state.current.date]?.[exercise.id];
  let selected = exercise.type === "multiple_choice" ? exercise.options.indexOf(old?.answer) : -1;
  let input = null;
  let choices = null;
  if (exercise.type === "multiple_choice") {
    choices = node("div", "choices");
    exercise.options.forEach((option, optionIndex) => {
      const button = richNode("button", "choice", `${String.fromCharCode(65 + optionIndex)}. ${option}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(optionIndex === selected));
      button.classList.toggle("selected", optionIndex === selected);
      button.addEventListener("click", () => {
        selected = optionIndex;
        choices.querySelectorAll("button").forEach((choice, i) => {
          choice.classList.toggle("selected", i === selected);
          choice.setAttribute("aria-pressed", String(i === selected));
        });
        if (!answer.hidden) grade();
      });
      choices.append(button);
    });
    card.append(choices);
  } else {
    const label = node("label", "input-label", exercise.type === "rewrite" ? "你的改写句子" : "请填入空格中的词");
    input = node("input", "answer-input");
    input.type = "text";
    input.autocomplete = "off";
    input.id = `answer-${state.current.date}-${exercise.id}`;
    input.value = old?.answer || "";
    label.htmlFor = input.id;
    card.append(label, input);
    input.addEventListener("change", () => { if (!answer.hidden && input.value.trim()) grade(); });
  }

  const actions = node("div", "question-actions");
  const toggle = node("button", "answer-toggle", "答えを見る");
  const feedback = node("span", "feedback", old ? (old.isCorrect ? "已记录：正确" : "已记录：需复习") : "");
  const answer = node("div", "answer");
  answer.id = `solution-${state.current.date}-${exercise.id}`;
  answer.hidden = true;
  toggle.type = "button";
  toggle.setAttribute("aria-controls", answer.id);
  toggle.setAttribute("aria-expanded", "false");
  const correctText = exercise.type === "multiple_choice" ? exercise.options[exercise.answer] : exercise.answer;
  answer.append(richNode("strong", "", `正确答案：${correctText}`), richNode("p", "", exercise.explanation), richNode("p", "", `纠错：${exercise.correction}`));
  const selfCheck = node("div", "self-check");
  [true, false].forEach(correct => {
    const button = node("button", "", correct ? "我答对了" : "还需复习");
    button.type = "button";
    button.setAttribute("aria-pressed", String(old?.isCorrect === correct));
    button.addEventListener("click", () => {
      const response = currentResponse() || "（未填写）";
      recordAttempt(exercise, response, correct);
      setFeedback(correct);
    });
    selfCheck.append(button);
  });
  answer.append(selfCheck);
  actions.append(toggle, feedback);
  card.append(actions, answer);

  function currentResponse() { return exercise.type === "multiple_choice" ? (selected < 0 ? "" : exercise.options[selected]) : input.value.trim(); }
  function setFeedback(correct) {
    feedback.textContent = correct ? "已记录：正确" : "已记录：需复习";
    feedback.className = `feedback ${correct ? "good" : "bad"}`;
    selfCheck.querySelectorAll("button").forEach((button, i) => button.setAttribute("aria-pressed", String((i === 0) === correct)));
  }
  function grade() {
    const response = currentResponse();
    if (!response) return;
    const accepted = exercise.type === "multiple_choice" ? [exercise.options[exercise.answer]] : [exercise.answer, ...(exercise.accepted_answers || [])];
    const correct = accepted.some(item => normalizedAnswer(item) === normalizedAnswer(response));
    recordAttempt(exercise, response, correct);
    setFeedback(correct);
  }
  toggle.addEventListener("click", () => {
    answer.hidden = !answer.hidden;
    toggle.textContent = answer.hidden ? "答えを見る" : "答えを隠す";
    toggle.setAttribute("aria-expanded", String(!answer.hidden));
    if (!answer.hidden) grade();
  });
  return card;
}

function renderLesson(lesson) {
  const oldSelection = JSON.stringify(state.progress.dailySelections[lesson.date]);
  state.activeExercises = Adaptive.chooseExercises(lesson, state.progress);
  if (JSON.stringify(state.progress.dailySelections[lesson.date]) !== oldSelection) saveProgress();
  $("#hero-date").textContent = formatDate(lesson.date);
  $("#hero-duration").textContent = `约 ${lesson.duration_minutes} 分钟`;
  $("#hero-title").textContent = lesson.title;
  $("#hero-summary").textContent = lesson.summary;
  const selectedReviews = state.activeExercises.filter(item => lesson.review_exercises?.some(review => review.id === item.id));
  const reviewIds = selectedReviews.length ? [...new Set(selectedReviews.flatMap(item => item.grammar_points))] : lesson.review_points;
  const reviewNames = reviewIds.map(id => lesson.grammar_points.find(point => point.id === id)?.name || id);
  $("#lesson-explanation").textContent = lesson.explanation + (reviewNames.length ? ` 本期复习：${reviewNames.join("、")}。` : "");
  $("#adaptive-note").hidden = !selectedReviews.length;
  if (selectedReviews.length) $("#adaptive-note").textContent = `根据已有答题记录，今天加练「${reviewNames.join("、")}」。登录后复习题选择也会跨设备同步。`;
  const visiblePointIds = new Set(state.activeExercises.flatMap(item => item.grammar_points));
  const visiblePoints = lesson.grammar_points.filter(point => visiblePointIds.has(point.id));
  $("#grammar-points").replaceChildren(...visiblePoints.map((point, i) => {
    const card = node("article", "point");
    card.append(node("p", "point-label", `POINT ${String(i + 1).padStart(2, "0")}`),
      node("h3", "", point.name), node("p", "", point.explanation));
    return card;
  }));
  $("#examples").replaceChildren(...lesson.examples.map(example => {
    const card = node("article", "example");
    card.append(richNode("p", "example-jp", example.jp), node("p", "example-zh", example.zh));
    return card;
  }));
  $("#exercises").replaceChildren(...state.activeExercises.map(renderExercise));
  updateCompletion();
}

async function openLesson(date, asToday) {
  if (!state.lessons.some(item => item.date === date)) return;
  showStatus("正在加载练习…");
  $("#lesson-view").hidden = true;
  try {
    const lesson = await getJSON(`./data/${date}.json`);
    state.current = lesson;
    renderLesson(lesson);
    $("#today-nav").classList.toggle("active", asToday);
    const missingToday = asToday && date !== state.today;
    $("#today-notice").hidden = !missingToday;
    if (missingToday) $("#today-notice").textContent = `今日の練習はまだありません。${formatDate(state.today)} 的内容尚未发布，下面显示最近一篇可用练习。`;
    hideStatus();
    $("#lesson-view").hidden = false;
    history.replaceState(null, "", asToday ? location.pathname + location.search : `#${date}`);
  } catch (error) { showStatus(`练习无法加载：${error.message}。请检查 data 文件和部署状态。`, false); }
}

async function init() {
  $("#today-nav").addEventListener("click", () => {
    const lesson = todayLesson();
    if (lesson) openLesson(lesson.date, true);
  });
  $("#complete-button").addEventListener("click", () => {
    if (!state.current || $("#complete-button").disabled) return;
    state.progress.completedDates[state.current.date] = new Date().toISOString();
    saveProgress();
    updateCompletion();
  });
  const closeClear = () => { $("#clear-confirm").hidden = true; $("#clear-progress").setAttribute("aria-expanded", "false"); };
  $("#clear-progress").addEventListener("click", () => {
    const open = $("#clear-confirm").hidden;
    $("#clear-confirm").hidden = !open;
    $("#clear-progress").setAttribute("aria-expanded", String(open));
  });
  $("#clear-no").addEventListener("click", closeClear);
  $("#clear-yes").addEventListener("click", () => {
    state.progress = emptyProgress();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Memory state is still cleared. */ }
    if (state.current) renderLesson(state.current);
    renderHistory();
    closeClear();
  });
  await window.CloudSync.init({
    getProgress: () => state.progress,
    emptyProgress,
    setProgress: (progress) => {
      state.progress = progress;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* In-memory progress still works. */ }
      if (state.current) renderLesson(state.current);
      else renderHistory();
    }
  });
  try {
    const index = await getJSON("./data/index.json");
    if (!Array.isArray(index.lessons) || !index.lessons.length) throw new Error("练习索引为空");
    state.lessons = index.lessons.filter(item => item.date <= state.today);
    if (!state.lessons.length) {
      renderHistory();
      $("#today-nav").disabled = true;
      history.replaceState(null, "", location.pathname + location.search);
      showStatus("目前还没有可用的练习，请稍后再来。", false);
      return;
    }
    const requested = location.hash.slice(1);
    const archived = state.lessons.find(item => item.date === requested);
    await openLesson(archived?.date || todayLesson().date, !archived);
  } catch (error) { showStatus(`无法读取练习索引：${error.message}。请通过静态服务器打开网站。`, false); }
}

init();
