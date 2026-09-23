"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { todayShanghai, planForDate, requestDeepSeek, verifyPlan } = require("./generate-daily.js");

test("uses the Shanghai calendar date across UTC midnight", () => {
  assert.equal(todayShanghai(new Date("2026-09-25T16:30:00Z")), "2026-09-26");
});

test("builds a rotating topic and review pool from earlier lessons", () => {
  const plan = planForDate("2026-09-26");
  assert.equal(plan.topic.title, "から・ので");
  assert.ok(plan.reviewPoints.length >= 2);
  assert.ok(!plan.reviewPoints.some(point => plan.topic.points.some(main => main.id === point.id)));
});

test("sends DeepSeek Flash JSON request with the key only in the authorization header", async () => {
  const plan = planForDate("2026-09-26");
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ date: plan.date }) } }] }) };
  };
  assert.deepEqual(await requestDeepSeek(plan, "test-secret", fetcher), { date: plan.date });
  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer test-secret");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.ok(!request.options.body.includes("test-secret"));
});

test("rejects generated lessons missing review candidates", () => {
  const plan = planForDate("2026-09-26");
  assert.throws(() => verifyPlan({ date: plan.date, title: plan.topic.title, grammar_points: [], review_points: [], examples: [], exercises: [], review_exercises: [] }, plan));
});
