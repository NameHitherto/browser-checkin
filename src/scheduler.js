  let activeBatch = null;
  let lastRequestId = null;

  async function runManaged(options) {
    if (activeBatch) {
      const error = new Error('已有批量签到运行，请稍后再试');
      error.code = 'BATCH_BUSY';
      throw error;
    }
    const task = runBatch(options).finally(() => {
      if (activeBatch === task) activeBatch = null;
    });
    activeBatch = task;
    return task;
  }

  async function startupCheck() {
    if (!(await setting('schedule.enabled', true))) return '启动自动签到已关闭';
    return runManaged({ force: false, startup: true });
  }

  async function manualReverify() {
    return runManaged({ force: true, startup: false });
  }

  async function handleManualRequest(request) {
    if (!request?.id || request.id === lastRequestId) return;
    if (Date.now() - Number(request.at || 0) > 15000) return;
    lastRequestId = request.id;
    await write('manualAck', { id: request.id, at: Date.now() });
    try {
      await manualReverify();
    } catch (error) {
      GM_log(error.message || '全站重新核验未完成，请查看保留页面', 'warn');
    }
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('全部已启用网站：立即重新核验并签到', () => {
      manualReverify().catch(error => GM_log(error.message || '全站重新核验未完成，请查看保留页面', 'warn'));
    });
  }

  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(PREFIX + 'manualRequest', (_name, _old, next) => {
      handleManualRequest(next).catch(error => GM_log(error.message || '手动核验触发失败', 'warn'));
    });
  }

  startupCheck().catch(error => {
    GM_log(error.message || '启动自动签到未完成，请查看保留页面', 'warn');
  });

  // Stay resident solely for event-driven menu/trigger handling with zero polling timers.
  return new Promise(() => {});
