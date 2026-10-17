import { clearSessionCookie, revokeSession } from '@/app/auth';
export async function POST(request: Request) {
  await revokeSession(request);
  return Response.json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(request), 'cache-control': 'no-store' } });
}
