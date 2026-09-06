import '/stable-render-bridge.js?v=20260906-1';

function showNotice(message) {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;padding:10px 14px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(14,18,30,.94);color:#dce2ee;font:12px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.32)';
  notice.textContent = message;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 5200);
}

function markMode(mode) {
  document.documentElement.dataset.studioMode = mode;
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.querySelector('.studio-version-badge')) return;
  const badge = document.createElement('span');
  badge.className = `studio-version-badge ${mode === 'v3' ? '' : 'fallback'}`.trim();
  badge.textContent = mode === 'v3' ? 'V3 · 本地文字引擎已启用' : '兼容模式 · 文字引擎未启用';
  actions.prepend(badge);
}

async function start() {
  try {
    await import('/app-v3.js?v=20260906-1');
    markMode('v3');
    return;
  } catch (error) {
    console.error('studio:v3-startup-error', error);
    showNotice('新版文字引擎启动失败，已自动切换到稳定图片编辑模式。');
  }

  try {
    await import('/app-v2.js?v=20260906-1');
    markMode('v2');
  } catch (error) {
    console.error('studio:v2-startup-error', error);
    showNotice('编辑器启动失败，请强制刷新页面后重试。');
  }
}

start();
