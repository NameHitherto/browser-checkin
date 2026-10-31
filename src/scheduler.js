  // Keep the returned promise alive so ScriptCat retains this background task.
  // Run immediately on browser/script startup, then detect local date rollover.
  while (true) {
    try { await scheduledTick(); }
    catch (error) { GM_log(error.message || '自动签到未完成，请查看保留页面', 'warn'); }
    await sleep(60000);
  }
