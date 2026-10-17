import { env } from 'cloudflare:workers';
import { isAuthorized, unauthorized } from '@/app/auth';

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) return unauthorized();
  if (!env.AMAP_JS_KEY || !env.AMAP_SECURITY_JS_CODE) {
    return Response.json({ error: '高德地图密钥尚未配置' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  return Response.json({ key: env.AMAP_JS_KEY, serviceHost: `${new URL(request.url).origin}/api/amap` }, { headers: { 'cache-control': 'no-store' } });
}
