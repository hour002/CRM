import type { Metadata } from 'next';
import './globals.css';
import './crm.css';
import './auth.css';
import './admin.css';
import './admin-layout.css';
import './assignments.css';
export const metadata: Metadata = {
  title: '客户沟通管理台',
  description: '手动设置客户级别与沟通节奏的客户和销售线索管理工具',
  openGraph: { title: '客户沟通管理台', description: '让每个客户，都在正确的节奏里', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: '客户沟通管理台', description: '让每个客户，都在正确的节奏里', images: ['/og.png'] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
