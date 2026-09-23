"use strict";

// Local records remain usable without a network connection. The cloud stores only
// per-user answers, completion dates, and the selected review exercise IDs.
window.CloudSync = (() => {
  const OWNER_KEY = "practice-progress-owner";
  const client = window.supabase?.createClient(
    window.CLOUD_CONFIG.url,
    window.CLOUD_CONFIG.publishableKey,
    { auth: { detectSessionInUrl: true, persistSession: true } }
  );
  let hooks;
  let user = null;
  let running = null;
  let timer = null;
  let revision = 0;

  const status = (message) => { document.querySelector("#sync-status").textContent = message; };
  const setControls = () => {
    document.querySelector("#login-form").hidden = Boolean(user);
    document.querySelector("#signed-in-actions").hidden = !user;
    document.querySelector("#storage-note").textContent = user
      ? "学习记录保存在当前设备，并同步到你的账号。"
      : "未登录时，学习记录保存在当前浏览器。";
  };
  const key = (row) => `${row.lesson_date}\u0000${row.exercise_id}`;
  const parseTime = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

  async function fetchRows(table) {
    const { data, error } = await client.from(table).select("*").eq("user_id", user.id);
    if (error) throw error;
    return data;
  }

  async function upsert(table, rows) {
    if (!rows.length) return;
    const conflict = table === "practice_attempts" ? "user_id,lesson_date,exercise_id" : "user_id,lesson_date";
    const { error } = await client.from(table).upsert(rows, { onConflict: conflict });
    if (error) throw error;
  }

  function mergeProgress(local, remoteAttempts, remoteCompletions, remoteSelections) {
    const merged = hooks.emptyProgress();
    const uploads = { attempts: [], completions: [], selections: [] };
    const remoteById = new Map(remoteAttempts.map(row => [key(row), row]));
    for (const row of remoteAttempts) {
      (merged.attempts[row.lesson_date] ||= {})[row.exercise_id] = {
        answer: row.answer, isCorrect: row.is_correct,
        grammarPoints: row.grammar_points, updatedAt: row.client_updated_at
      };
    }
    for (const [date, attempts] of Object.entries(local.attempts || {})) {
      for (const [exerciseId, attempt] of Object.entries(attempts || {})) {
        const existing = remoteById.get(`${date}\u0000${exerciseId}`);
        if (existing && parseTime(existing.client_updated_at) >= parseTime(attempt.updatedAt)) continue;
        merged.attempts[date] ||= {};
        merged.attempts[date][exerciseId] = attempt;
        uploads.attempts.push({ user_id: user.id, lesson_date: date, exercise_id: exerciseId,
          answer: attempt.answer, is_correct: attempt.isCorrect,
          grammar_points: attempt.grammarPoints, client_updated_at: attempt.updatedAt });
      }
    }
    for (const row of remoteCompletions) merged.completedDates[row.lesson_date] = row.completed_at;
    for (const [date, completedAt] of Object.entries(local.completedDates || {})) {
      if (merged.completedDates[date]) continue;
      merged.completedDates[date] = completedAt;
      uploads.completions.push({ user_id: user.id, lesson_date: date, completed_at: completedAt });
    }
    for (const row of remoteSelections) merged.dailySelections[row.lesson_date] = row.exercise_ids;
    for (const [date, ids] of Object.entries(local.dailySelections || {})) {
      if (merged.dailySelections[date] || !Array.isArray(ids) || !ids.length) continue;
      merged.dailySelections[date] = ids;
      uploads.selections.push({ user_id: user.id, lesson_date: date, exercise_ids: ids });
    }
    for (const attempts of Object.values(merged.attempts)) {
      for (const attempt of Object.values(attempts)) {
        for (const point of attempt.grammarPoints || []) {
          const stat = merged.grammarStats[point] ||= { attempts: 0, errors: 0 };
          stat.attempts++;
          if (!attempt.isCorrect) stat.errors++;
        }
      }
    }
    return { merged, uploads };
  }

  async function sync() {
    if (!user) return;
    if (running) return running;
    const runUserId = user.id;
    const startedAtRevision = revision;
    running = (async () => {
      status("正在同步学习记录…");
      const [attempts, completions, selections] = await Promise.all([
        fetchRows("practice_attempts"), fetchRows("practice_completions"),
        fetchRows("practice_daily_selections")
      ]);
      if (user?.id !== runUserId) return;
      const { merged, uploads } = mergeProgress(hooks.getProgress(), attempts, completions, selections);
      await upsert("practice_attempts", uploads.attempts);
      await upsert("practice_completions", uploads.completions);
      await upsert("practice_daily_selections", uploads.selections);
      if (user?.id !== runUserId) return;
      if (revision === startedAtRevision) hooks.setProgress(merged);
      localStorage.setItem(OWNER_KEY, user.id);
      status(revision === startedAtRevision ? `已同步 · ${user.email}` : "本机有新答题，继续同步…");
    })().catch(error => {
      status(`同步暂时失败，已保存在本机：${error.message}`);
    }).finally(() => {
      running = null;
      if (user?.id === runUserId && revision !== startedAtRevision) setTimeout(() => sync(), 0);
    });
    return running;
  }

  async function acceptSession(session) {
    const incoming = session?.user || null;
    if (incoming && user?.id === incoming.id) return;
    if (incoming) {
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner && owner !== incoming.id) hooks.setProgress(hooks.emptyProgress());
    }
    user = incoming;
    setControls();
    if (user) await sync();
    else status("未登录 · 记录仅保存在当前浏览器");
  }

  async function init(options) {
    hooks = options;
    if (!client) { status("云端登录暂不可用，记录保存在本机"); return; }
    document.querySelector("#login-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = document.querySelector("#login-email").value.trim();
      const button = form.querySelector("button");
      button.disabled = true;
      status("正在发送登录链接…");
      const { error } = await client.auth.signInWithOtp({ email,
        options: { emailRedirectTo: `${location.origin}${location.pathname}` } });
      status(error ? `无法发送登录链接：${error.message}` : "请查看邮箱中的登录链接，并在此浏览器打开。首次登录会合并本机学习记录。");
      button.disabled = false;
    });
    document.querySelector("#sync-now").addEventListener("click", () => sync());
    document.querySelector("#sign-out").addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) { status(`退出失败：${error.message}`); return; }
      user = null;
      localStorage.removeItem(OWNER_KEY);
      hooks.setProgress(hooks.emptyProgress());
      setControls();
      status("已退出登录。本机缓存已清除，云端记录仍保留。");
    });
    const { data, error } = await client.auth.getSession();
    if (error) status(`登录状态读取失败：${error.message}`);
    await acceptSession(data?.session);
    client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { acceptSession(session); }, 0);
    });
    window.addEventListener("focus", () => { if (user) sync(); });
  }

  function changed() {
    if (!user) return;
    revision++;
    clearTimeout(timer);
    timer = setTimeout(() => sync(), 400);
  }

  return { init, changed, sync, mergeProgress };
})();
