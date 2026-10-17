import { requireAdmin, forbidden } from '@/app/auth';
import { ensureDatabase } from '@/db/raw';

const fallback = { screen:'visits', title:'客户拜访', notes:'在这里记录你希望增加、删除或调整的功能。', modules:{city:true,map:true,visitPlan:true,summary:true} };

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  try { const db=await ensureDatabase(); const row=await db.prepare('SELECT content, updated_at AS updatedAt FROM prototype_specs WHERE id = 1').first<{content:string;updatedAt:string}>(); return Response.json({ spec:row?JSON.parse(row.content):fallback, updatedAt:row?.updatedAt||null },{headers:{'cache-control':'private, no-store'}}); }
  catch (error) { return Response.json({ error:error instanceof Error?error.message:'加载失败' },{status:500}); }
}

export async function PUT(request: Request) {
  if (!(await requireAdmin(request))) return forbidden();
  try { const body=await request.json() as {spec?:unknown}; const content=JSON.stringify(body.spec??fallback); if(content.length>20000)return Response.json({error:'原型内容过长'},{status:400}); const now=new Date().toISOString(); const db=await ensureDatabase(); await db.prepare(`INSERT INTO prototype_specs (id, content, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`).bind(content,now).run(); return Response.json({ok:true,updatedAt:now}); }
  catch (error) { return Response.json({ error:error instanceof Error?error.message:'保存失败' },{status:500}); }
}
