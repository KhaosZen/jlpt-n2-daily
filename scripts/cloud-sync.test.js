"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function makeSync(remote = {}) {
  const writes = [];
  const controls = new Map();
  const store = new Map();
  const user = { id: "user-a", email: "learner@example.com" };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null }),
      onAuthStateChange: () => {},
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => ({ error: null })
    },
    from: table => ({
      select: () => ({ eq: async () => ({ data: remote[table] || [], error: null }) }),
      upsert: async rows => { writes.push({ table, rows }); return { error: null }; }
    })
  };
  const context = {
    window: { supabase: { createClient: () => client }, CLOUD_CONFIG: { url: "test", publishableKey: "test" }, addEventListener: () => {} },
    document: { querySelector: selector => {
      if (!controls.has(selector)) controls.set(selector, { hidden: false, textContent: "", addEventListener: () => {} });
      return controls.get(selector);
    } },
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    location: { origin: "https://example.com", pathname: "/daily/" },
    setTimeout, clearTimeout, console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../cloud-sync.js"), "utf8"), context);
  return { sync: context.window.CloudSync, writes, controls };
}

test("first sign-in merges local and remote answers and recomputes grammar counts", async () => {
  const remote = {
    practice_attempts: [{ user_id: "user-a", lesson_date: "2026-09-23", exercise_id: "q1", answer: "old",
      is_correct: false, grammar_points: ["はず"], client_updated_at: "2026-09-23T01:00:00Z" }],
    practice_completions: [{ user_id: "user-a", lesson_date: "2026-09-22", completed_at: "2026-09-22T12:00:00Z" }]
  };
  const { sync, writes } = makeSync(remote);
  let progress = { version: 2, completedDates: { "2026-09-23": "2026-09-23T12:00:00Z" },
    attempts: { "2026-09-23": { q1: { answer: "new", isCorrect: true, grammarPoints: ["はず"], updatedAt: "2026-09-23T02:00:00Z" } } },
    grammarStats: { はず: { attempts: 99, errors: 99 } }, dailySelections: { "2026-09-23": ["r1"] } };
  await sync.init({ getProgress: () => progress, setProgress: value => { progress = value; },
    emptyProgress: () => ({ version: 2, completedDates: {}, attempts: {}, grammarStats: {}, dailySelections: {} }) });
  assert.equal(progress.attempts["2026-09-23"].q1.answer, "new");
  assert.equal(progress.grammarStats["はず"].attempts, 1);
  assert.equal(progress.grammarStats["はず"].errors, 0);
  assert.equal(progress.completedDates["2026-09-22"], "2026-09-22T12:00:00Z");
  assert.deepEqual(Array.from(progress.dailySelections["2026-09-23"]), ["r1"]);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].rows[0].user_id, "user-a");
});

test("newer remote answer wins without another upload", async () => {
  const remote = { practice_attempts: [{ user_id: "user-a", lesson_date: "2026-09-23", exercise_id: "q1", answer: "remote",
    is_correct: false, grammar_points: ["はず"], client_updated_at: "2026-09-23T03:00:00Z" }] };
  const { sync, writes } = makeSync(remote);
  let progress = { version: 2, completedDates: {}, attempts: { "2026-09-23": { q1: {
    answer: "local", isCorrect: true, grammarPoints: ["はず"], updatedAt: "2026-09-23T02:00:00Z"
  } } }, grammarStats: {}, dailySelections: {} };
  await sync.init({ getProgress: () => progress, setProgress: value => { progress = value; },
    emptyProgress: () => ({ version: 2, completedDates: {}, attempts: {}, grammarStats: {}, dailySelections: {} }) });
  assert.equal(progress.attempts["2026-09-23"].q1.answer, "remote");
  assert.equal(progress.grammarStats["はず"].errors, 1);
  assert.equal(writes.length, 0);
});
