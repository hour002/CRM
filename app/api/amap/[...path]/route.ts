import { env } from 'cloudflare:workers';
import { isAuthorized, unauthorized } from '@/app/auth';

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!(await isAuthorized(request))) return unauthorized();
  if (!env.AMAP_SECURITY_JS_CODE) return Response.json({ error: '高德地图安全密钥尚未配置' }, { status: 503 });
  const { path } = await context.params;
  const pathname = path.join('/');
  const source = new URL(request.url);
  const host = pathname.startsWith('v4/map/styles') ? 'https://webapi.amap.com' : 'https://restapi.amap.com';
  const target = new URL(`/${pathname}`, host);
  source.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.searchParams.set('jscode', env.AMAP_SECURITY_JS_CODE);
  const response = await fetch(target, { headers: { accept: request.headers.get('accept') || '*/*' } });
  const headers = new Headers(response.headers);
  headers.set('cache-control', response.ok ? 'private, max-age=300' : 'no-store');
  headers.delete('set-cookie');
  return new Response(response.body, { status: response.status, headers });
}
