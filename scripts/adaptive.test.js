"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Adaptive = require("../adaptive.js");

const lesson = {
  date: "2026-09-26",
  exercises: [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }],
  review_exercises: [
    { id: "r-ni", grammar_points: ["ni"] },
    { id: "r-tara", grammar_points: ["tara"] },
    { id: "r-wa", grammar_points: ["wa"] }
  ]
};

test("selects the weakest review point and keeps the daily choice stable", () => {
  const progress = { grammarStats: { ni: { attempts: 4, errors: 3 }, tara: { attempts: 4, errors: 0 } }, dailySelections: {} };
  assert.deepEqual(Adaptive.chooseExercises(lesson, progress).map(item => item.id), ["q1", "q2", "q3", "q4", "r-ni", "r-wa"]);
  progress.grammarStats.tara.errors = 4;
  assert.equal(Adaptive.chooseExercises(lesson, progress).at(-2).id, "r-ni");
  assert.deepEqual(progress.dailySelections[lesson.date], ["r-ni", "r-wa"]);
});

test("legacy lessons retain all their exercises", () => {
  assert.equal(Adaptive.chooseExercises({ exercises: lesson.exercises }, { grammarStats: {} }).length, 4);
});
