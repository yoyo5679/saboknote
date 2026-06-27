import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '사복노트 인스타그램 DM 봇',
  description: '인스타그램 댓글 트리거 → DM 자동발송 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
