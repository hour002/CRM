import { ensureDatabase } from '@/db/raw';
import { requireAdmin, forbidden } from '@/app/auth';

const fields:Record<string,string>={importance:'importance',frequency:'frequency',category:'category',organization:'organization',industry:'industry',notes:'notes',initialContact:'initial_contact',contacted:'contacted',lastContactAt:'last_contact_at',contactSummary:'contact_summary'};

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  if (!(await requireAdmin(request))) return forbidden();
  try{
    const {id}=await context.params; const contactId=Number(id); const body=await request.json() as Record<string,unknown>&{addInteraction?:boolean};
    const entries=Object.entries(body).filter(([key])=>fields[key]);
    if(!entries.length)return Response.json({error:'没有可更新内容'},{status:400});
    const now=new Date().toISOString(); const values=entries.map(([key,value])=>key==='contacted'?(value?1:0):value); const assignments=entries.map(([key])=>`${fields[key]} = ?`).join(', ');
    const db=await ensureDatabase(); const updates=[db.prepare(`UPDATE network_contacts SET ${assignments}, updated_at = ? WHERE id = ?`).bind(...values,now,contactId)];
    if(body.addInteraction&&typeof body.contactSummary==='string')updates.push(db.prepare('INSERT INTO network_interactions (contact_id, contacted_at, summary) VALUES (?, ?, ?)').bind(contactId,now,body.contactSummary));
    await db.batch(updates); return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'保存失败'},{status:500})}
}
