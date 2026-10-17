import { createUserSession, verifyPassword, verifyUserCredentials, type SessionActor } from '@/app/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    if (!body.password) {
      return Response.json({ error: '密码不正确' }, { status: 401, headers: { 'cache-control': 'no-store' } });
    }
    let actor:SessionActor|null=null;
    if(body.username?.trim()){try{actor=await verifyUserCredentials(body.username,body.password)}catch{actor=null}}
    else if(await verifyPassword(body.password))actor={id:null,username:'admin',displayName:'陶帅',role:'admin',managerId:null,legacy:true};
    if(!actor)return Response.json({error:'用户名或密码不正确'},{status:401,headers:{'cache-control':'no-store'}});
    return Response.json({ ok: true }, { headers: { 'set-cookie': await createUserSession(request,actor), 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '登录失败' }, { status: 500 });
  }
}
