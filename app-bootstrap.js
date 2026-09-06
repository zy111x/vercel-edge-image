import '/stable-render-bridge.js?v=20260906-2';

const BUILD = '20260906-3';
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

function parseCheck(source) {
  const withoutImports = source.replace(/^import\s+[^;]+;\s*$/gm, '');
  return new Function(withoutImports);
}

async function importRepairedV3() {
  const response = await fetch(`/app-v3.js?source=${BUILD}`, { cache: 'reload' });
  if (!response.ok) throw new Error(`/app-v3.js HTTP ${response.status}`);
  let source = await response.text();

  try {
    parseCheck(source);
  } catch (error) {
    if (!(error instanceof SyntaxError) || !/Unexpected end of input/i.test(error.message)) throw error;
    source += '\n}';
    parseCheck(source);
    console.warn('studio:v3-source-repaired', 'Recovered missing closing brace in applyPreviewOp().');
  }

  const imports = [
    ['./text-fonts.js', new URL(`/text-fonts.js?v=${BUILD}`, location.href).href],
    ['./text-presets.js', new URL(`/text-presets.js?v=${BUILD}`, location.href).href],
    ['./text-layer-manager.js', new URL(`/text-layer-manager.js?v=${BUILD}`, location.href).href],
  ];
  for (const [relative, absolute] of imports) {
    source = source.replaceAll(`'${relative}'`, JSON.stringify(absolute));
    source = source.replaceAll(`\"${relative}\"`, JSON.stringify(absolute));
  }

  source += '\n//# sourceURL=edge-image-studio-v3-repaired.js';
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  try {
    await import(moduleUrl);
  } finally {
    setTimeout(() => URL.revokeObjectURL(moduleUrl), 0);
  }
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
    await importRepairedV3();
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
