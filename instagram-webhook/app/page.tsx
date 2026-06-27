export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>🤖 사복노트 인스타그램 DM 봇</h1>
      <p>웹훅 API 서버가 정상 실행 중입니다.</p>
      <ul>
        <li>웹훅 엔드포인트: <code>/api/webhook</code></li>
        <li>트리거 키워드: <strong>측정</strong></li>
      </ul>
    </main>
  );
}
