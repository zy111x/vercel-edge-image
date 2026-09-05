const ALLOWED_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'raw.githubusercontent.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

export const config = { runtime: 'edge' };

function allowed(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function proxyUrl(raw) {
  return `/api/vendor?url=${encodeURIComponent(raw)}`;
}

function rewriteCss(css, sourceUrl) {
  let out = css.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/g, (match, quote, value) => {
    const resource = String(value || '').trim();
    if (!resource || resource.startsWith('data:') || resource.startsWith('blob:') || resource.startsWith('#')) return match;
    try {
      const absolute = new URL(resource, sourceUrl).toString();
      if (!allowed(absolute)) return match;
      return `url("${proxyUrl(absolute)}")`;
    } catch {
      return match;
    }
  });

  out = out.replace(/@import\s+(['"])([^'"]+)\1/g, (match, quote, value) => {
    try {
      const absolute = new URL(value, sourceUrl).toString();
      if (!allowed(absolute)) return match;
      return `@import url("${proxyUrl(absolute)}")`;
    } catch {
      return match;
    }
  });
  return out;
}

function contentType(sourceUrl, upstreamType) {
  const path = new URL(sourceUrl).pathname.toLowerCase();
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.ttf')) return 'font/ttf';
  if (path.endsWith('.otf')) return 'font/otf';
  return upstreamType || 'application/octet-stream';
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      },
    });
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405 });
  }

  const sourceUrl = new URL(request.url).searchParams.get('url') || '';
  if (!allowed(sourceUrl)) {
    return new Response('Asset URL is not allowed', { status: 400 });
  }

  try {
    const upstream = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Edge-Image-Studio/1.0',
        'accept': '*/*',
      },
    });
    if (!upstream.ok) {
      return new Response(`Upstream asset failed (${upstream.status})`, { status: 502 });
    }

    const upstreamType = upstream.headers.get('content-type') || '';
    const type = contentType(sourceUrl, upstreamType);
    const headers = {
      'content-type': type,
      'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      'x-edge-image-vendor-proxy': '1',
    };

    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

    if (type.startsWith('text/css')) {
      const css = rewriteCss(await upstream.text(), sourceUrl);
      return new Response(css, { status: 200, headers });
    }

    return new Response(await upstream.arrayBuffer(), { status: 200, headers });
  } catch (error) {
    console.error('vendor-proxy:error', error?.message || error);
    return new Response('Unable to load vendor asset', { status: 502 });
  }
}
