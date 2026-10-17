'use client';
import { useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import type { CustomerImportRow } from './crm-types';

type Props = { open: boolean; onClose: () => void; onImported: (message: string) => Promise<void> | void };
type Cell = string | number | boolean | Date | null;

const aliases: Record<keyof CustomerImportRow, string[]> = {
  name: ['客户', '客户名称', '公司名称', '企业名称', 'name', 'company', 'companyname'],
  province: ['省份', '省', 'province'], city: ['城市', '市', 'city'],
  address: ['详细地址', '客户地址', '公司地址', '收货地址', '地址', 'address'],
  latitude: ['纬度', 'latitude', 'lat'], longitude: ['经度', 'longitude', 'lng', 'lon'],
  customerLevel: ['客户级别', '客户等级', '级别', 'customerlevel', 'level'],
  salesperson: ['负责人', '业务员', '销售', 'salesperson', 'owner'],
  contactName: ['联系人', '联系人姓名', 'contact', 'contactname'],
  contactPhone: ['联系电话', '电话', '手机', 'contactphone', 'phone'],
  tags: ['标签', '客户标签', 'tags'],
};

const normalizeHeader = (value: Cell) => String(value ?? '').trim().toLowerCase().replace(/[\s_\-（）()]/g, '');
const valueText = (value: Cell) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
const parseCoordinate = (value: Cell) => {
  const number = Number(value);
  return valueText(value) && Number.isFinite(number) ? number : null;
};

function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = []; let row: Cell[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field.trim()); field = '';
      if (char !== ',') { if (row.some((item) => valueText(item))) rows.push(row); row = []; }
      continue;
    }
    field += char;
  }
  row.push(field.trim()); if (row.some((item) => valueText(item))) rows.push(row);
  return rows;
}

function rowsToCustomers(matrix: Cell[][]) {
  if (matrix.length < 2) throw new Error('表格至少需要表头和一行客户数据');
  const header = matrix[0].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex((cell) => names.some((name) => normalizeHeader(name) === cell))])) as Record<keyof CustomerImportRow, number>;
  if (indexes.name < 0) throw new Error('未找到“客户 / 客户名称 / 公司名称”列');
  return matrix.slice(1).map((row) => ({
    name: valueText(row[indexes.name]), province: indexes.province >= 0 ? valueText(row[indexes.province]) : '待补充',
    city: indexes.city >= 0 ? valueText(row[indexes.city]) : '', address: indexes.address >= 0 ? valueText(row[indexes.address]) : '',
    latitude: indexes.latitude >= 0 ? parseCoordinate(row[indexes.latitude]) : null,
    longitude: indexes.longitude >= 0 ? parseCoordinate(row[indexes.longitude]) : null,
    customerLevel: indexes.customerLevel >= 0 ? valueText(row[indexes.customerLevel]) : '一般客户',
    salesperson: indexes.salesperson >= 0 ? valueText(row[indexes.salesperson]) : '',
    contactName: indexes.contactName >= 0 ? valueText(row[indexes.contactName]) : '',
    contactPhone: indexes.contactPhone >= 0 ? valueText(row[indexes.contactPhone]) : '',
    tags: indexes.tags >= 0 ? valueText(row[indexes.tags]) : '',
  })).filter((row) => row.name);
}

export default function CustomerImport({ open, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState(''); const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const exact = useMemo(() => rows.filter((row) => row.latitude !== null && row.longitude !== null).length, [rows]);

  const chooseFile = async (file?: File) => {
    if (!file) return; setError(''); setRows([]); setFileName(file.name); setBusy(true);
    try {
      const suffix = file.name.toLowerCase();
      const matrix = suffix.endsWith('.csv') ? parseCsv((await file.text()).replace(/^\uFEFF/, '')) : await readXlsxFile(file) as Cell[][];
      const parsed = rowsToCustomers(matrix);
      if (!parsed.length) throw new Error('表格中没有有效客户记录');
      setRows(parsed.slice(0, 500));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取文件'); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!rows.length) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/customers/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '导入失败');
      await onImported(`已处理 ${result.processed} 家：新增 ${result.inserted} 家，更新 ${result.updated} 家`);
      setRows([]); setFileName(''); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); }
    finally { setBusy(false); }
  };
  if (!open) return null;
  return <div className="overlay" onMouseDown={(event)=>{if(event.currentTarget===event.target)onClose()}}><section className="modal import-modal">
    <div className="drawer-head"><div><p className="eyebrow">IMPORT CUSTOMERS</p><h2>导入新客户</h2></div><button className="close" onClick={onClose}>×</button></div>
    <p className="import-help">支持 XLSX、CSV。至少需要“客户”列；可选列：省份、城市、详细地址、经度、纬度、客户级别、负责人、联系人、联系电话、标签。</p>
    <label className="file-drop"><input type="file" accept=".xlsx,.csv" onChange={(event)=>void chooseFile(event.target.files?.[0])}/><span>{busy?'正在读取…':'选择 Excel / CSV 文件'}</span><small>{fileName||'单次最多 500 家；同名客户将更新资料'}</small></label>
    {error&&<p className="import-error">{error}</p>}
    {rows.length>0&&<><div className="import-summary"><strong>{rows.length}</strong> 家客户可导入 <span>{exact} 家含精确经纬度</span></div>
      <div className="import-preview"><table><thead><tr><th>客户</th><th>省市</th><th>级别</th><th>定位</th></tr></thead><tbody>{rows.slice(0,6).map((row,index)=><tr key={`${row.name}-${index}`}><td>{row.name}</td><td>{[row.province,row.city].filter(Boolean).join(' · ')||'待补充'}</td><td>{row.customerLevel||'一般客户'}</td><td>{row.latitude!==null&&row.longitude!==null?'精确坐标':row.city?'城市约略':'省级约略'}</td></tr>)}</tbody></table></div></>}
    <div className="drawer-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy||!rows.length} onClick={()=>void submit()}>{busy?'处理中…':`导入 ${rows.length||''} 家客户`}</button></div>
  </section></div>;
}
