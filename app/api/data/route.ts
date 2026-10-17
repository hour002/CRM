import { ensureDatabase } from '@/db/raw';
import { getSessionActor, ownedOrSubordinateSql, unauthorized } from '@/app/auth';

export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return unauthorized();
  try {
    const db = await ensureDatabase();
    const admin = actor.role === 'admin';
    const owner = actor.id;
    const vis = ownedOrSubordinateSql('c.owner_user_id');
    const visLead = ownedOrSubordinateSql('l.owner_user_id');
    const visOpp = ownedOrSubordinateSql('o.owner_user_id');

    const customerBase = `SELECT c.id,c.name,c.province,c.city,c.address,c.latitude,c.longitude,c.location_precision AS locationPrecision,c.salesperson,c.order_count AS orderCount,c.latest_order_date AS latestOrderDate,c.latest_order_no AS latestOrderNo,c.customer_level AS customerLevel,c.communication_cycle AS communicationCycle,c.communicated,c.last_communication_at AS lastCommunicationAt,c.communication_summary AS communicationSummary,c.contact_name AS contactName,c.contact_phone AS contactPhone,c.tags,c.owner_user_id AS ownerUserId,u.display_name AS ownerName,c.stage FROM customers c LEFT JOIN crm_users u ON u.id=c.owner_user_id`;
    const leadBase = `SELECT l.id,l.company_name AS companyName,l.contact_name AS contactName,l.contact_phone AS contactPhone,l.source,l.status,l.stage,l.province,l.notes,l.owner_user_id AS ownerUserId,u.display_name AS ownerName,l.invalid_reason AS invalidReason,l.converted_account_id AS convertedAccountId,l.converted_at AS convertedAt,l.created_at AS createdAt,l.updated_at AS updatedAt FROM leads l LEFT JOIN crm_users u ON u.id=l.owner_user_id`;

    const customers = admin
      ? await db
          .prepare(
            customerBase +
              " ORDER BY CASE c.customer_level WHEN '大客户' THEN 1 WHEN '重点客户' THEN 2 ELSE 3 END,c.name",
          )
          .all()
      : await db.prepare(customerBase + ` WHERE ${vis} ORDER BY c.name`).bind(owner, owner).all();

    const leads = admin
      ? await db.prepare(leadBase + ' ORDER BY l.created_at DESC').all()
      : await db.prepare(leadBase + ` WHERE ${visLead} ORDER BY l.created_at DESC`).bind(owner, owner).all();

    const interactions = admin
      ? await db
          .prepare(
            'SELECT id,customer_id AS customerId,communicated_at AS communicatedAt,summary FROM interactions ORDER BY communicated_at DESC LIMIT 200',
          )
          .all()
      : await db
          .prepare(
            `SELECT i.id,i.customer_id AS customerId,i.communicated_at AS communicatedAt,i.summary FROM interactions i JOIN customers c ON c.id=i.customer_id WHERE ${vis} ORDER BY i.communicated_at DESC LIMIT 200`,
          )
          .bind(owner, owner)
          .all();

    const visits = admin
      ? await db
          .prepare(
            'SELECT id,customer_id AS customerId,planned_at AS plannedAt,status,purpose,summary,created_at AS createdAt,updated_at AS updatedAt FROM customer_visits ORDER BY planned_at DESC',
          )
          .all()
      : await db
          .prepare(
            `SELECT v.id,v.customer_id AS customerId,v.planned_at AS plannedAt,v.status,v.purpose,v.summary,v.created_at AS createdAt,v.updated_at AS updatedAt FROM customer_visits v JOIN customers c ON c.id=v.customer_id WHERE ${vis} ORDER BY v.planned_at DESC`,
          )
          .bind(owner, owner)
          .all();

    const contacts = admin
      ? await db
          .prepare(
            'SELECT id,sequence,name,importance,frequency,category,organization,industry,notes,initial_contact AS initialContact,contacted,last_contact_at AS lastContactAt,contact_summary AS contactSummary,created_at AS createdAt,updated_at AS updatedAt FROM network_contacts ORDER BY sequence,id',
          )
          .all()
      : { results: [] };
    const networkInteractions = admin
      ? await db
          .prepare(
            'SELECT id,contact_id AS contactId,contacted_at AS contactedAt,summary FROM network_interactions ORDER BY contacted_at DESC LIMIT 300',
          )
          .all()
      : { results: [] };

    const oppBase = `SELECT o.id,o.account_id AS accountId,o.lead_id AS leadId,o.name,o.code,o.stage,o.sales_estimated_amount AS salesEstimatedAmount,o.project_amount AS projectAmount,o.expected_close_date AS expectedCloseDate,o.importance,o.owner_user_id AS ownerUserId,u.display_name AS ownerName,c.name AS accountName,o.is_draft AS isDraft,o.created_at AS createdAt,o.updated_at AS updatedAt FROM opportunities o LEFT JOIN crm_users u ON u.id=o.owner_user_id LEFT JOIN customers c ON c.id=o.account_id`;
    const opportunities = admin
      ? await db.prepare(oppBase + ' WHERE COALESCE(o.is_draft,0)=0 ORDER BY o.updated_at DESC').all()
      : await db
          .prepare(oppBase + ` WHERE COALESCE(o.is_draft,0)=0 AND ${visOpp} ORDER BY o.updated_at DESC`)
          .bind(owner, owner)
          .all();

    let todos: unknown[] = [];
    let subordinateOverdue: unknown[] = [];
    if (owner != null) {
      const todoRows = await db
        .prepare(
          `SELECT id, owner_user_id AS ownerUserId, target_type AS targetType, target_id AS targetId, status, content, next_contact_at AS nextContactAt, created_at AS createdAt
           FROM follow_ups WHERE owner_user_id=? AND status='pending' ORDER BY next_contact_at ASC LIMIT 50`,
        )
        .bind(owner)
        .all();
      todos = todoRows.results || [];
      const overdueRows = await db
        .prepare(
          `SELECT f.id, f.owner_user_id AS ownerUserId, u.display_name AS ownerName, f.target_type AS targetType, f.target_id AS targetId, f.content, f.next_contact_at AS nextContactAt
           FROM follow_ups f JOIN crm_users u ON u.id=f.owner_user_id
           WHERE u.manager_id=? AND f.status='pending' AND f.next_contact_at IS NOT NULL AND f.next_contact_at < ?
           ORDER BY f.next_contact_at ASC LIMIT 50`,
        )
        .bind(owner, new Date().toISOString())
        .all();
      subordinateOverdue = overdueRows.results || [];
    }

    return Response.json(
      {
        actor,
        customers: customers.results,
        leads: leads.results,
        interactions: interactions.results,
        visits: visits.results,
        contacts: contacts.results,
        networkInteractions: networkInteractions.results,
        opportunities: opportunities.results || [],
        todos,
        subordinateOverdue,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '加载失败' }, { status: 500 });
  }
}
