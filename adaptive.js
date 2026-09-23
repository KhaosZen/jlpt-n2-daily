"use strict";

// Shared by the browser and the small Node test suite. No network calls or personal data uploads.
const Adaptive = (() => {
  function weakness(pointIds, stats) {
    return Math.max(...pointIds.map(id => {
      const point = stats[id] || { attempts: 0, errors: 0 };
      return (point.errors + 1) / (point.attempts + 2);
    }));
  }

  function tieBreak(date, id) {
    let hash = 0;
    for (const character of `${date}:${id}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash;
  }

  function chooseExercises(lesson, progress) {
    const base = lesson.exercises;
    const pool = lesson.review_exercises || [];
    if (!pool.length) return [...base];

    const selections = progress.dailySelections ||= {};
    const savedIds = selections[lesson.date];
    let selected = Array.isArray(savedIds) ? savedIds.map(id => pool.find(item => item.id === id)).filter(Boolean) : [];
    if (selected.length !== Math.min(2, pool.length)) {
      selected = [...pool].sort((a, b) => {
        const difference = weakness(b.grammar_points, progress.grammarStats) - weakness(a.grammar_points, progress.grammarStats);
        return difference || tieBreak(lesson.date, a.id) - tieBreak(lesson.date, b.id);
      }).slice(0, 2);
      selections[lesson.date] = selected.map(item => item.id);
    }
    return [...base, ...selected];
  }

  return { chooseExercises, weakness };
})();

if (typeof module !== "undefined") module.exports = Adaptive;
