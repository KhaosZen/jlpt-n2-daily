#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const DAY_MS = 24 * 60 * 60 * 1000;

function todayShanghai(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function utcDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期格式错误：${date}`);
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== date) throw new Error(`无效日期：${date}`);
  return day.valueOf();
}

function readJSON(file) { return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")); }

function planForDate(date, index = readJSON("index.json"), curriculum = readJSON("topics.json")) {
  const offset = Math.floor((utcDay(date) - utcDay(curriculum.start_date)) / DAY_MS);
  if (offset < 0) throw new Error(`自动生成从 ${curriculum.start_date} 开始`);
  const topic = curriculum.topics[offset % curriculum.topics.length];
  const mainIds = new Set(topic.points.map(point => point.id));
  const review = new Map();
  for (const entry of index.lessons.filter(item => item.date < date)) {
    const lesson = readJSON(`${entry.date}.json`);
    for (const point of lesson.grammar_points) {
      if (!mainIds.has(point.id) && !review.has(point.id)) review.set(point.id, point);
      if (review.size >= 6) break;
    }
    if (review.size >= 6) break;
  }
  if (review.size < 2) throw new Error("历史知识点不足，至少需要 2 个复习候选点");
  return { date, topic, reviewPoints: [...review.values()] };
}

function promptForPlan(plan) {
  return {
    system: `你是严谨的日语教师，面向中文母语学习者设计从初级到高级的语法练习，不限定 JLPT 等级。根据当天主题的实际难度出题，持续巩固助词和基础语法，也练习中高级表达。只输出一个合法 JSON 对象，不要 Markdown。所有题目都必须有唯一且无歧义的最佳答案；详细解释其他选项为什么在该语境错误或不自然。日语例句要自然实用，日文汉字逐词加 漢字{かんじ} 注音，中文说明不要加注音。不要编造语法规则。`,
    user: `请为 ${plan.date} 生成一份 5–10 分钟练习，主题「${plan.topic.title}」。题目难度以主题为准，不要统一压到 N2；讲解要让约 N2 水平、但基础不够扎实的学习者也能理解。
主知识点 ID 和名称：${JSON.stringify(plan.topic.points)}。
复习候选知识点（保持这些稳定 ID）：${JSON.stringify(plan.reviewPoints)}。
输出 JSON 字段严格如下：
{
  "schema_version": 1, "date": "${plan.date}", "title": "${plan.topic.title}", "duration_minutes": 9,
  "summary": "中文短简介", "explanation": "中文简短语法讲解",
  "grammar_points": [{"id":"知识点ID","name":"语法名称","explanation":"中文讲解"}],
  "review_points": ["复习候选知识点ID"],
  "examples": [{"jp":"日语例句，汉字用 漢字{かんじ} 标注","zh":"中文翻译"}],
  "exercises": [{"id":"q1","type":"multiple_choice","grammar_points":["知识点ID"],"prompt":"中文题意","jp":"日语题干（　）","options":["选项A","选项B"],"answer":0,"explanation":"正确答案的语感","correction":"其他答案为什么不适合"}],
  "review_exercises": [{"id":"r-知识点ID","type":"fill_blank","grammar_points":["复习知识点ID"],"prompt":"中文题意","jp":"日语题干（　）","answer":"正确填词","accepted_answers":["正确填词"],"explanation":"正确原因","correction":"常见错误与原因"}]
}
要求：grammar_points 包含全部主知识点和全部复习候选知识点，ID 不变。review_points 列出全部复习候选 ID。examples 恰好 3 条。exercises 恰好 4 题，涵盖两个主知识点，至少 2 道 multiple_choice、1 道 fill_blank、1 道 rewrite。rewrite 用 source、answer、accepted_answers；fill_blank 用 jp、answer、accepted_answers；multiple_choice 用 jp、options、从 0 开始的 answer。review_exercises 恰好 ${plan.reviewPoints.length} 题，每个候选知识点各 1 题，ID 为 r-加知识点ID。每题需完整 prompt、grammar_points、explanation、correction。复习题可以混合三种题型。不要重复旧题的句子。日语题干、例句、选项和改写标准答案里的每个汉字都必须加读音；accepted_answers 则至少包含不带注音的标准答案。每题注意日语正误、答案和解释一致。`
  };
}

async function requestDeepSeek(plan, apiKey, fetcher = fetch) {
  if (!apiKey) throw new Error("缺少 DEEPSEEK_API_KEY：请在仓库 Actions Secrets 中配置");
  const prompts = promptForPlan(plan);
  const response = await fetcher("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [{ role: "system", content: prompts.system }, { role: "user", content: prompts.user }],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 8192,
      stream: false
    }),
    signal: AbortSignal.timeout(150000)
  });
  if (!response.ok) throw new Error(`DeepSeek API 返回 HTTP ${response.status}`);
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason !== "stop") throw new Error(`DeepSeek 输出未完成：${choice?.finish_reason || "unknown"}`);
  const content = choice.message?.content;
  if (!content?.trim()) throw new Error("DeepSeek 返回空内容");
  try { return JSON.parse(content); }
  catch { throw new Error("DeepSeek 未返回可解析的 JSON"); }
}

function verifyPlan(lesson, plan) {
  if (lesson.date !== plan.date || lesson.title !== plan.topic.title) throw new Error("生成的日期或主题与计划不符");
  const mainIds = plan.topic.points.map(point => point.id);
  const reviewIds = plan.reviewPoints.map(point => point.id);
  const pointIds = new Set(lesson.grammar_points?.map(point => point.id));
  if (![...mainIds, ...reviewIds].every(id => pointIds.has(id))) throw new Error("生成内容缺少指定的知识点 ID");
  if (!Array.isArray(lesson.review_points) || !reviewIds.every(id => lesson.review_points.includes(id))) throw new Error("复习点列表不完整");
  if (lesson.examples?.length !== 3 || lesson.exercises?.length !== 4 || lesson.review_exercises?.length !== reviewIds.length) throw new Error("例句或题目数量不符合生成计划");
  if (!mainIds.every(id => lesson.exercises.some(item => item.grammar_points?.includes(id)))) throw new Error("主知识点没有得到练习");
  if (!reviewIds.every(id => lesson.review_exercises.some(item => item.id === `r-${id}` && item.grammar_points?.includes(id)))) throw new Error("复习候选题不完整");
  const types = lesson.exercises.map(item => item.type);
  if (types.filter(type => type === "multiple_choice").length < 2 || !types.includes("fill_blank") || !types.includes("rewrite")) throw new Error("主练习题型不完整");
}

async function main() {
  const dateArg = process.argv.indexOf("--date");
  const date = dateArg >= 0 ? process.argv[dateArg + 1] : (process.env.TARGET_DATE || todayShanghai());
  const preview = process.argv.includes("--preview-plan");
  const index = readJSON("index.json");
  const target = path.join(dataDir, `${date}.json`);
  utcDay(date);
  if (fs.existsSync(target)) {
    if (!index.lessons.some(item => item.date === date)) throw new Error(`${date}.json 已存在但未列入索引`);
    console.log(`${date} 已有练习，跳过生成。`);
    return;
  }
  const plan = planForDate(date, index);
  if (preview) { console.log(JSON.stringify(plan, null, 2)); return; }
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY：请在仓库 Actions Secrets 中配置");
  const oldIndex = fs.readFileSync(path.join(dataDir, "index.json"), "utf8");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const lesson = await requestDeepSeek(plan, process.env.DEEPSEEK_API_KEY);
      verifyPlan(lesson, plan);
      const nextIndex = { ...index, lessons: [{ date, title: lesson.title }, ...index.lessons].sort((a, b) => b.date.localeCompare(a.date)) };
      fs.writeFileSync(target, `${JSON.stringify(lesson, null, 2)}\n`);
      fs.writeFileSync(path.join(dataDir, "index.json"), `${JSON.stringify(nextIndex, null, 2)}\n`);
      const check = spawnSync(process.execPath, [path.join(__dirname, "validate-data.js")], { cwd: root, encoding: "utf8" });
      if (check.status !== 0) throw new Error(`生成内容未通过校验：\n${check.stderr || check.stdout}`);
      console.log(`${date} 已生成并通过校验。`);
      return;
    } catch (error) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.writeFileSync(path.join(dataDir, "index.json"), oldIndex);
      if (attempt === 3) throw error;
      console.warn(`生成尝试 ${attempt} 未通过：${error.message}；重新生成。`);
    }
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { todayShanghai, planForDate, promptForPlan, requestDeepSeek, verifyPlan };
