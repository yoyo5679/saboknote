import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '사복노트 자동 DM 봇 | Admin Dashboard',
  description: 'Instagram Auto DM System — ManyChat 무료 대체',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #F8FAFC; font-family: 'Noto Sans KR', -apple-system, sans-serif; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
