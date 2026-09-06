/*
 * Stable exact-render bridge.
 * The server is responsible only for Photon image operations and always returns PNG.
 * Text layers and final WEBP/JPEG encoding are composed locally in the browser.
 */
const nativeFetch = window.fetch.bind(window);

function isStudioRequest(input) {
  try {
    const url = typeof input === 'string' ? new URL(input, location.href) : new URL(input.url, location.href);
    return url.origin === location.origin && url.pathname === '/api/studio';
  } catch {
    return false;
  }
}

function cloneStudioForm(source) {
  const next = new FormData();
  for (const [key, value] of source.entries()) {
    if (key === 'textOverlay') continue;
    next.append(key, value);
  }
  next.set('format', 'png');
  next.set('quality', '100');
  return next;
}

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取精确预览图片。')); };
    img.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('浏览器图片编码失败。')), type, quality);
  });
}

async function composeResult(baseBlob, overlayBlob, format, quality) {
  const base = await imageFromBlob(baseBlob);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth || base.width;
  canvas.height = base.naturalHeight || base.height;
  const normalized = String(format || 'webp').toLowerCase();
  const ctx = canvas.getContext('2d', { alpha: normalized === 'png' });
  if (normalized === 'jpg' || normalized === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  if (overlayBlob && overlayBlob.size) {
    const overlay = await imageFromBlob(overlayBlob);
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  }

  const mime = normalized === 'png' ? 'image/png' : normalized === 'jpg' || normalized === 'jpeg' ? 'image/jpeg' : 'image/webp';
  const q = Math.max(.01, Math.min(1, (Number(quality) || 92) / 100));
  return canvasBlob(canvas, mime, normalized === 'png' ? undefined : q);
}

window.fetch = async function stableFetch(input, init = {}) {
  if (!isStudioRequest(input) || !(init?.body instanceof FormData)) {
    return nativeFetch(input, init);
  }

  const sourceForm = init.body;
  const overlay = sourceForm.get('textOverlay');
  const desiredFormat = String(sourceForm.get('format') || 'webp').toLowerCase();
  const desiredQuality = Number(sourceForm.get('quality') || 92);
  const serverForm = cloneStudioForm(sourceForm);
  const response = await nativeFetch(input, { ...init, body: serverForm });
  if (!response.ok) return response;

  const baseBlob = await response.blob();
  const resultBlob = await composeResult(
    baseBlob,
    overlay && typeof overlay.arrayBuffer === 'function' ? overlay : null,
    desiredFormat,
    desiredQuality,
  );

  const headers = new Headers(response.headers);
  headers.set('content-type', resultBlob.type || 'application/octet-stream');
  headers.set('cache-control', 'no-store');
  headers.set('x-edge-image-studio-composite', 'browser');
  headers.delete('content-length');
  return new Response(resultBlob, { status: response.status, statusText: response.statusText, headers });
};
