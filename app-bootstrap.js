import '/stable-render-bridge.js?v=20260906-2';

const BUILD = '20260906-2';
const MODULE_ASSETS = [
  '/app-v3.js',
  '/text-fonts.js',
  '/text-presets.js',
  '/text-layer-manager.js',
  '/stable-render-bridge.js',
];

function showNotice(message) {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;padding:10px 14px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(14,18,30,.94);color:#dce2ee;font:12px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.32);max-width:min(720px,calc(100vw - 32px));white-space:normal';
  notice.textContent = message;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 7600);
}

function shortError(error) {
  const name = String(error?.name || 'Error');
  const message = String(error?.message || 'unknown startup error').replace(/\s+/g, ' ').trim();
  return `${name}: ${message}`.slice(0, 180);
}

function reportError(stage, error) {
  const body = JSON.stringify({
    stage,
    name: error?.name || 'Error',
    message: error?.message || String(error || ''),
    stack: error?.stack || '',
    href: location.href,
    ua: navigator.userAgent,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-log', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/client-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch {}
}

function markMode(mode, error = null) {
  document.documentElement.dataset.studioMode = mode;
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  document.querySelector('.studio-version-badge')?.remove();
  const badge = document.createElement('span');
  badge.className = `studio-version-badge ${mode === 'v3' ? '' : 'fallback'}`.trim();
  if (mode === 'v3') {
    badge.textContent = 'V3 · 本地文字引擎已启用';
  } else {
    badge.textContent = '兼容模式 · 文字引擎未启用';
    if (error) {
      badge.title = shortError(error);
      badge.dataset.error = shortError(error);
    }
  }
  actions.prepend(badge);
}

async function refreshModuleAssets() {
  const results = await Promise.allSettled(MODULE_ASSETS.map(async (path) => {
    const response = await fetch(`${path}?preflight=${BUILD}`, { cache: 'reload' });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return path;
  }));
  const failed = results.filter((item) => item.status === 'rejected');
  if (failed.length) throw new Error(`V3 module preflight failed: ${failed.map((item) => item.reason?.message || item.reason).join('; ')}`);
}

window.addEventListener('error', (event) => {
  if (document.documentElement.dataset.studioMode === 'v3') reportError('window-error', event.error || new Error(event.message || 'window error'));
});
window.addEventListener('unhandledrejection', (event) => {
  if (document.documentElement.dataset.studioMode === 'v3') reportError('unhandled-rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'unhandled rejection')));
});

async function start() {
  let startupError = null;
  try {
    await refreshModuleAssets();
    await import(`/app-v3.js?v=${BUILD}`);
    markMode('v3');
    return;
  } catch (error) {
    startupError = error;
    console.error('studio:v3-startup-error', error);
    reportError('v3-startup', error);
    showNotice(`新版文字引擎启动失败，已自动切换兼容模式。诊断：${shortError(error)}`);
  }

  try {
    await import(`/app-v2.js?v=${BUILD}`);
    markMode('v2', startupError);
  } catch (error) {
    console.error('studio:v2-startup-error', error);
    reportError('v2-startup', error);
    showNotice(`编辑器启动失败：${shortError(error)}`);
  }
}

start();
