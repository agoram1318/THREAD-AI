import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'THREAD-AI RSS Tester',
  description: 'RSS URL 테스트 수집기',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
