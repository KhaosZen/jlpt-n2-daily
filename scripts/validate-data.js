#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const errors = [];
const isText = value => typeof value === "string" && value.trim().length > 0;
const fail = (file, message) => errors.push(`${file}: ${message}`);

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")); }
  catch (error) { fail(file, `无法读取或解析 JSON (${error.message})`); return null; }
}

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function requireText(object, field, file, prefix = "") {
  if (!isText(object?.[field])) fail(file, `${prefix}${field} 必须是非空字符串`);
}

function validateLesson(file, lesson, indexedTitle) {
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) { fail(file, "顶层必须是对象"); return; }
  if (lesson.schema_version !== 1) fail(file, "schema_version 必须为 1");
  if (!validDate(lesson.date) || `${lesson.date}.json` !== file) fail(file, "date 必须是有效日期且与文件名一致");
  for (const field of ["title", "summary", "explanation"]) requireText(lesson, field, file);
  if (indexedTitle !== undefined && lesson.title !== indexedTitle) fail(file, "title 与 data/index.json 不一致");
  if (!Number.isInteger(lesson.duration_minutes) || lesson.duration_minutes < 1 || lesson.duration_minutes > 30) fail(file, "duration_minutes 必须为 1–30 的整数");

  const pointIds = new Set();
  if (!Array.isArray(lesson.grammar_points) || lesson.grammar_points.length === 0) fail(file, "grammar_points 必须是非空数组");
  else lesson.grammar_points.forEach((point, i) => {
    const at = `grammar_points[${i}].`;
    for (const field of ["id", "name", "explanation"]) requireText(point, field, file, at);
    if (pointIds.has(point.id)) fail(file, `${at}id 重复`);
    pointIds.add(point.id);
  });
  if (!Array.isArray(lesson.review_points)) fail(file, "review_points 必须是数组");
  else lesson.review_points.forEach(id => { if (!pointIds.has(id)) fail(file, `review_points 包含未知知识点 ${id}`); });

  if (!Array.isArray(lesson.examples) || lesson.examples.length < 2) fail(file, "examples 至少需要 2 条");
  else lesson.examples.forEach((example, i) => {
    requireText(example, "jp", file, `examples[${i}].`);
    requireText(example, "zh", file, `examples[${i}].`);
  });

  const exerciseIds = new Set();
  if (!Array.isArray(lesson.exercises) || lesson.exercises.length < 4) { fail(file, "exercises 至少需要 4 题"); return; }
  lesson.exercises.forEach((exercise, i) => {
    const at = `exercises[${i}].`;
    for (const field of ["id", "prompt", "explanation", "correction"]) requireText(exercise, field, file, at);
    if (exerciseIds.has(exercise.id)) fail(file, `${at}id 重复`);
    exerciseIds.add(exercise.id);
    if (!Array.isArray(exercise.grammar_points) || !exercise.grammar_points.length) fail(file, `${at}grammar_points 必须是非空数组`);
    else exercise.grammar_points.forEach(id => { if (!pointIds.has(id)) fail(file, `${at}grammar_points 包含未知知识点 ${id}`); });
    switch (exercise.type) {
      case "multiple_choice":
        requireText(exercise, "jp", file, at);
        if (!Array.isArray(exercise.options) || exercise.options.length < 2 || !exercise.options.every(isText)) fail(file, `${at}options 至少需要 2 个非空选项`);
        if (!Number.isInteger(exercise.answer) || exercise.answer < 0 || exercise.answer >= (exercise.options?.length || 0)) fail(file, `${at}answer 必须是有效的零基选项序号`);
        break;
      case "fill_blank":
        requireText(exercise, "jp", file, at);
        requireText(exercise, "answer", file, at);
        if (!Array.isArray(exercise.accepted_answers) || !exercise.accepted_answers.length || !exercise.accepted_answers.every(isText)) fail(file, `${at}accepted_answers 必须是非空字符串数组`);
        break;
      case "rewrite":
        requireText(exercise, "source", file, at);
        requireText(exercise, "answer", file, at);
        if (!Array.isArray(exercise.accepted_answers) || !exercise.accepted_answers.length || !exercise.accepted_answers.every(isText)) fail(file, `${at}accepted_answers 必须是非空字符串数组`);
        break;
      default: fail(file, `${at}type 不支持：${exercise.type}`);
    }
  });
}

const index = readJSON("index.json");
const referenced = new Set();
if (!index || index.schema_version !== 1 || !Array.isArray(index.lessons) || !index.lessons.length) fail("index.json", "需要 schema_version: 1 和非空 lessons 数组");
else index.lessons.forEach((item, i) => {
  const at = `lessons[${i}]`;
  if (!validDate(item?.date)) { fail("index.json", `${at}.date 无效`); return; }
  if (i > 0 && index.lessons[i - 1].date <= item.date) fail("index.json", "lessons 必须按日期从新到旧排列");
  if (!isText(item.title)) fail("index.json", `${at}.title 必须是非空字符串`);
  const file = `${item.date}.json`;
  if (referenced.has(file)) fail("index.json", `${file} 重复引用`);
  referenced.add(file);
  if (!fs.existsSync(path.join(dataDir, file))) fail("index.json", `${file} 不存在`);
  else validateLesson(file, readJSON(file), item.title);
});

for (const file of fs.readdirSync(dataDir).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
  if (!referenced.has(file)) fail(file, "文件未被 data/index.json 引用");
}
if (errors.length) { console.error(`数据校验失败（${errors.length} 项）：\n${errors.map(item => `- ${item}`).join("\n")}`); process.exitCode = 1; }
else console.log(`数据校验通过：${referenced.size} 天，${[...referenced].reduce((n, file) => n + readJSON(file).exercises.length, 0)} 道题。`);
