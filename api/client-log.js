export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }

  try {
    const body = await request.json();
    const payload = {
      stage: String(body?.stage || 'unknown').slice(0, 80),
      name: String(body?.name || 'Error').slice(0, 80),
      message: String(body?.message || '').slice(0, 800),
      stack: String(body?.stack || '').slice(0, 1800),
      href: String(body?.href || '').slice(0, 500),
      ua: String(body?.ua || '').slice(0, 500),
    };
    console.error('studio-client-error', JSON.stringify(payload));
  } catch (error) {
    console.error('studio-client-log-failed', error?.message || error);
  }

  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
