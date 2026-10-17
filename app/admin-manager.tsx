'use client';
import { useCallback, useEffect, useState } from 'react';

type User = {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'sales';
  active: boolean | number;
  managerId: number | null;
  createdAt: string;
  updatedAt: string;
};
type Log = {
  id: number;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
};
type AUser = { id: number; displayName: string; username: string; role: string; managerId?: number | null };
type Customer = { id: number; name: string; province: string; ownerUserId: number | null };
type Lead = { id: number; companyName: string; status: string; ownerUserId: number | null };

const empty = { username: '', displayName: '', role: 'sales', password: '', managerId: '' };

export default function AdminManager({ legacy, toast }: { legacy: boolean; toast: (message: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [owners, setOwners] = useState<AUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [u, l, a] = await Promise.all([
      fetch('/api/admin/users', { cache: 'no-store' }),
      fetch('/api/admin/logs', { cache: 'no-store' }),
      fetch('/api/admin/assignments', { cache: 'no-store' }),
    ]);
    const uj = (await u.json()) as any;
    const lj = (await l.json()) as any;
    const aj = (await a.json()) as any;
    if (!u.ok || !a.ok) throw new Error(uj.error || aj.error || '加载失败');
    setUsers(uj.users || []);
    setLogs(lj.logs || []);
    setOwners(aj.users || []);
    setCustomers(aj.customers || []);
    setLeads(aj.leads || []);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...draft,
        managerId: draft.managerId ? Number(draft.managerId) : null,
      };
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j.error);
      setDraft(empty);
      await load();
      toast('账号已创建');
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (user: User, body: Record<string, unknown>, message: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j.error);
      await load();
      toast(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败');
    } finally {
      setBusy(false);
    }
  };

  const reset = (user: User) => {
    const password = window.prompt(`为 ${user.displayName} 设置新密码（至少 8 位）`);
    if (password !== null) void patch(user, { password }, '密码已重置，旧登录已失效');
  };

  const toggleActive = (user: User) => {
    if (user.active) {
      const choices = users
        .filter((u) => u.id !== user.id && u.active)
        .map((u) => `${u.id}:${u.displayName}`)
        .join('\n');
      const raw = window.prompt(
        `停用 ${user.displayName} 前请指定数据接收人用户 ID。\n可选账号：\n${choices || '（暂无其他启用账号）'}`,
      );
      if (raw === null) return;
      const transferToUserId = Number(String(raw).trim());
      if (!Number.isInteger(transferToUserId) || transferToUserId < 1) {
        setError('请输入有效的接收人用户 ID');
        return;
      }
      void patch(user, { active: false, transferToUserId }, '账号已停用，数据已转移');
    } else {
      void patch(user, { active: true }, '账号已启用');
    }
  };

  const setManager = (user: User, value: string) => {
    void patch(
      user,
      { managerId: value ? Number(value) : null },
      value ? '直属上级已更新' : '已清除直属上级',
    );
  };

  const assign = async (type: 'customer' | 'lead', id: number, value: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/assignments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, id, ownerUserId: value ? Number(value) : null }),
      });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j.error);
      await load();
      toast('负责人已更新');
    } catch (e) {
      setError(e instanceof Error ? e.message : '分配失败');
    } finally {
      setBusy(false);
    }
  };

  const managerOptions = (
    <>
      <option value="">无直属上级</option>
      {users
        .filter((u) => u.active)
        .map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName} · {user.role === 'admin' ? '管理员' : '销售'}
          </option>
        ))}
    </>
  );

  const ownerOptions = (
    <>
      {owners.map((user) => (
        <option key={user.id} value={user.id}>
          {user.displayName} · {user.role === 'admin' ? '管理员' : '销售'}
        </option>
      ))}
    </>
  );

  const nameOf = (id: number | null) => {
    if (!id) return '—';
    return users.find((u) => u.id === id)?.displayName || `#${id}`;
  };

  return (
    <section className="workspace admin-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SYSTEM ADMIN</p>
          <h2>系统管理</h2>
          <p className="section-note">账号、角色、直属上级、客户归属与操作记录统一维护。</p>
        </div>
        <span className="admin-session">{legacy ? '当前使用原管理密码' : '当前使用管理员账号'}</span>
      </div>
      {legacy && (
        <div className="admin-callout">
          <strong>过渡模式</strong>
          <span>原管理密码仍可登录，创建并验证管理员账号后再停用过渡入口。</span>
        </div>
      )}
      <div className="admin-grid">
        <section className="admin-panel">
          <h3>新增账号</h3>
          <div className="admin-form">
            <label>
              登录名
              <input
                value={draft.username}
                placeholder="英文或数字，例如 taoshuai"
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              />
            </label>
            <label>
              姓名
              <input
                value={draft.displayName}
                placeholder="员工姓名"
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </label>
            <label>
              角色
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                <option value="sales">销售</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <label>
              直属上级
              <select
                value={draft.managerId}
                onChange={(e) => setDraft({ ...draft, managerId: e.target.value })}
              >
                {managerOptions}
              </select>
            </label>
            <label>
              初始密码
              <input
                type="password"
                value={draft.password}
                placeholder="至少 8 位"
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </label>
          </div>
          {error && <p className="admin-error">{error}</p>}
          <button className="primary-button admin-create" disabled={busy} onClick={() => void create()}>
            {busy ? '处理中…' : '创建账号'}
          </button>
          <p className="admin-warning">
            销售登录后看到自己的客户/线索，以及直属下属的数据（只读可分配）。停用账号必须指定接收人转移归属。
          </p>
        </section>
        <section className="admin-panel admin-summary">
          <h3>账号概览</h3>
          <strong>{users.length}</strong>
          <span>已建立账号</span>
          <div>
            <b>{users.filter((x) => x.role === 'admin' && x.active).length}</b> 位管理员 ·{' '}
            <b>{users.filter((x) => x.role === 'sales' && x.active).length}</b> 位销售
          </div>
        </section>
      </div>
      <div className="table-wrap admin-table">
        <table>
          <thead>
            <tr>
              <th>姓名 / 登录名</th>
              <th>角色</th>
              <th>直属上级</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.displayName}</strong>
                  <small>{user.username}</small>
                </td>
                <td>
                  <select
                    value={user.role}
                    disabled={busy}
                    onChange={(e) => void patch(user, { role: e.target.value }, '角色已更新')}
                  >
                    <option value="admin">管理员</option>
                    <option value="sales">销售</option>
                  </select>
                </td>
                <td>
                  <select
                    value={user.managerId ?? ''}
                    disabled={busy}
                    onChange={(e) => setManager(user, e.target.value)}
                  >
                    <option value="">无</option>
                    {users
                      .filter((u) => u.id !== user.id && u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                  </select>
                  <small style={{ display: 'block', color: '#7c8580' }}>{nameOf(user.managerId)}</small>
                </td>
                <td>
                  <span className={user.active ? 'admin-active' : 'admin-disabled'}>
                    {user.active ? '启用' : '停用'}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString('zh-CN')}</td>
                <td>
                  <div className="admin-actions">
                    <button onClick={() => reset(user)}>重置密码</button>
                    <button onClick={() => toggleActive(user)}>{user.active ? '停用' : '启用'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <div className="network-empty">尚未创建独立账号。</div>}
      </div>
      <section className="admin-assignments">
        <div>
          <h3>客户归属</h3>
          <span>{customers.filter((item) => !item.ownerUserId).length} 家未分配</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>客户</th>
                <th>省份</th>
                <th>负责人</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.province}</td>
                  <td>
                    <select
                      disabled={busy}
                      value={item.ownerUserId ?? ''}
                      onChange={(e) => void assign('customer', item.id, e.target.value)}
                    >
                      <option value="">未分配</option>
                      {ownerOptions}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {leads.length > 0 && (
        <section className="admin-assignments">
          <div>
            <h3>线索归属</h3>
            <span>{leads.filter((item) => !item.ownerUserId).length} 条未分配</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>线索</th>
                  <th>阶段</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.companyName}</strong>
                    </td>
                    <td>{item.status}</td>
                    <td>
                      <select
                        disabled={busy}
                        value={item.ownerUserId ?? ''}
                        onChange={(e) => void assign('lead', item.id, e.target.value)}
                      >
                        <option value="">未分配</option>
                        {ownerOptions}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="admin-logs">
        <h3>最近操作记录</h3>
        {logs.length ? (
          logs.map((log) => (
            <article key={log.id}>
              <div>
                <strong>{log.action}</strong>
                <span>
                  {log.targetType} {log.targetId && `#${log.targetId}`}
                </span>
              </div>
              <small>
                {log.actorName} · {new Date(log.createdAt).toLocaleString('zh-CN')}
              </small>
            </article>
          ))
        ) : (
          <p className="muted">暂无操作记录</p>
        )}
      </section>
    </section>
  );
}
