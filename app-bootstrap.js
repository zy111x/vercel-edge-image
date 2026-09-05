const FABRIC_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js',
  'https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js',
  'https://unpkg.com/fabric@5.3.0/dist/fabric.min.js',
  'https://raw.githubusercontent.com/fabricjs/fabric.js/v5.3.0/dist/fabric.min.js',
];

function loadScript(src, timeoutMs = 2600) {
  return new Promise((resolve) => {
    if (window.fabric) return resolve(true);
    const script = document.createElement('script');
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (!ok) script.remove();
      resolve(Boolean(ok && window.fabric));
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
}

async function ensureFabric() {
  if (window.fabric) return true;
  return new Promise((resolve) => {
    let remaining = FABRIC_SOURCES.length;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      if (value) {
        settled = true;
        resolve(true);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        settled = true;
        resolve(Boolean(window.fabric));
      }
    };
    for (const source of FABRIC_SOURCES) loadScript(source).then(finish);
  });
}

function showFallbackNotice(message) {
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
  badge.textContent = mode === 'v3' ? 'V3 · 艺术文字已启用' : '兼容模式 · 艺术文字未启用';
  actions.prepend(badge);
}

async function start() {
  const fabricReady = await ensureFabric();
  if (fabricReady) {
    try {
      await import('/app-v3.js?v=20260905-4');
      markMode('v3');
      return;
    } catch (error) {
      console.error('studio:v3-startup-error', error);
      showFallbackNotice('新版文字图层启动失败，已自动切换到稳定编辑模式。');
    }
  } else {
    console.warn('studio:fabric-unavailable');
    showFallbackNotice('艺术文字组件暂时无法加载，已自动切换到稳定编辑模式；图片功能仍可正常使用。');
  }

  try {
    await import('/app-v2.js?v=20260905-4');
    markMode('v2');
  } catch (error) {
    console.error('studio:v2-startup-error', error);
    showFallbackNotice('编辑器启动失败，请强制刷新页面后重试。');
  }
}

start();
