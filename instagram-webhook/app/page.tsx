'use client';

import { useEffect, useState, useCallback } from 'react';

interface Trigger {
  id: string;
  keyword: string;
  message: string;
  active: boolean;
  createdAt: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  userId: string;
  keyword: string;
  trigger: string;
  success: boolean;
  error?: string;
}

export default function Dashboard() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tab, setTab] = useState<'triggers' | 'logs' | 'guide'>('triggers');
  const [loading, setLoading] = useState(true);

  // 새 키워드 입력 폼 상태
  const [newKeyword, setNewKeyword] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchData = useCallback(async () => {
    const [tRes, lRes] = await Promise.all([
      fetch('/api/triggers'),
      fetch('/api/logs'),
    ]);
    const tData = await tRes.json();
    const lData = await lRes.json();
    setTriggers(tData.triggers ?? []);
    setLogs(lData.logs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10초마다 자동 새로고침
    return () => clearInterval(interval);
  }, [fetchData]);

  // 새 트리거 추가
  const handleAddTrigger = () => {
    if (!newKeyword.trim() || !newMessage.trim()) return;
    const newTrigger: Trigger = {
      id: Date.now().toString(),
      keyword: newKeyword.trim(),
      message: newMessage.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const updated = [...triggers, newTrigger];
    setTriggers(updated);
    setNewKeyword('');
    setNewMessage('');
  };

  const handleRemove = (id: string) => {
    setTriggers(triggers.filter((t) => t.id !== id));
  };

  const handleToggle = (id: string) => {
    setTriggers(
      triggers.map((t) => (t.id === id ? { ...t, active: !t.active } : t))
    );
  };

  const handleCopyJSON = async () => {
    const json = JSON.stringify(triggers, null, 2);
    await navigator.clipboard.writeText(json);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const triggersJson = JSON.stringify(triggers, null, 2);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          --glass-bg: rgba(255, 255, 255, 0.05);
          --glass-border: rgba(255, 255, 255, 0.1);
          --primary: #3b82f6;
          --primary-hover: #2563eb;
          --accent: #8b5cf6;
          --success: #10b981;
          --danger: #ef4444;
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
        }
        body {
          background: var(--bg-gradient);
          color: var(--text-main);
          font-family: 'Inter', -apple-system, sans-serif;
          min-height: 100vh;
          margin: 0;
          overflow-x: hidden;
        }
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .glass-card {
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
        .btn-hover {
          transition: all 0.3s ease;
        }
        .btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
        .tab-btn {
          transition: all 0.3s ease;
        }
        .tab-btn:hover:not(.active) {
          background: rgba(255, 255, 255, 0.1) !important;
        }
        .pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(1.1); }
        }
        .gradient-text {
          background: linear-gradient(to right, #60a5fa, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        input, textarea {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--glass-border);
          color: white;
          transition: border-color 0.3s ease;
        }
        input:focus, textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
      `}} />
      
      <div className="container">
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '48px', filter: 'drop-shadow(0 0 10px rgba(59,130,246,0.5))' }}>🚀</div>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }} className="gradient-text">
                사복노트 자동 DM 시스템
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Next-Gen Instagram Automation Dashboard
              </p>
            </div>
          </div>
          <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', borderRadius: '30px' }}>
            <span className="pulse" style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px' }}>SYSTEM ONLINE</span>
          </div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
          <StatCard icon="🎯" label="활성 키워드" value={triggers.filter(t=>t.active).length} sub={`총 ${triggers.length}개 등록됨`} color="var(--primary)" />
          <StatCard icon="✨" label="발송 성공" value={logs.filter(l=>l.success).length} sub="정상 발송된 DM" color="var(--success)" />
          <StatCard icon="⚠️" label="발송 실패" value={logs.filter(l=>!l.success).length} sub="권한/오류 확인 필요" color="var(--danger)" />
          <StatCard icon="⚡" label="엔드포인트" value="상태양호" sub="/api/webhook" color="var(--accent)" />
        </div>

        {/* 탭 네비게이션 */}
        <div className="glass-card" style={{ display: 'flex', gap: '8px', padding: '8px', marginBottom: '24px' }}>
          {(['triggers', 'logs', 'guide'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              style={{
                flex: 1, padding: '12px', border: 'none', borderRadius: '12px', cursor: 'pointer',
                fontSize: '15px', fontWeight: 600, transition: 'all 0.3s',
                background: tab === t ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: tab === t ? '#60a5fa' : 'var(--text-muted)',
                boxShadow: tab === t ? 'inset 0 0 0 1px rgba(59, 130, 246, 0.5)' : 'none'
              }}
            >
              {t === 'triggers' ? '🎯 트리거 관리' : t === 'logs' ? '📊 활동 로그' : '📖 설정 가이드'}
            </button>
          ))}
        </div>

        {/* ── 키워드 관리 탭 ── */}
        {tab === 'triggers' && (
          <div className="glass-card" style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: 'white' }}>DM 자동화 규칙 설정</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 28px' }}>
              사용자가 특정 키워드를 포함해 댓글을 남기면 즉시 연결된 메시지가 DM으로 전송됩니다.
            </p>

            {/* 키워드 목록 */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>데이터 동기화 중...</div>
            ) : triggers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                등록된 키워드가 없습니다. 첫 번째 규칙을 만들어보세요!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                {triggers.map((t) => (
                  <div key={t.id} style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '20px', 
                    border: '1px solid rgba(255,255,255,0.05)',
                    opacity: t.active ? 1 : 0.5, transition: 'opacity 0.3s'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', padding: '6px 16px', borderRadius: '20px', marginBottom: '12px', fontSize: '14px', fontWeight: 600, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <span>🔑</span> {t.keyword}
                      </div>
                      <p style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 8px', lineHeight: 1.6 }}>
                        {t.message.split('\\n').map((line, i) => <span key={i}>{line}<br/></span>)}
                      </p>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>생성일: {new Date(t.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginLeft: '24px' }}>
                      <button
                        onClick={() => handleToggle(t.id)}
                        className="btn-hover"
                        style={{ padding: '8px 16px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, 
                                 background: t.active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.1)', 
                                 color: t.active ? '#34d399' : 'var(--text-muted)' }}
                      >
                        {t.active ? 'ON' : 'OFF'}
                      </button>
                      <button onClick={() => handleRemove(t.id)} className="btn-hover" style={{ padding: '8px 16px', border: 'none', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 새 키워드 추가 폼 */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '24px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: 'white' }}>✨ 새로운 자동화 규칙 만들기</h3>
              <div style={{ marginBottom: '16px' }}>
                <input
                  placeholder="반응할 키워드 (예: 측정, 단어장)"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '15px' }}
                />
              </div>
              <textarea
                placeholder={'전송할 DM 메시지 내용...\n(링크나 안내 문구를 자유롭게 적어주세요)'}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
                style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '15px', marginBottom: '16px' }}
              />
              <button
                onClick={handleAddTrigger}
                disabled={!newKeyword.trim() || !newMessage.trim()}
                className="btn-hover"
                style={{ width: '100%', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: (!newKeyword.trim() || !newMessage.trim()) ? 0.5 : 1 }}
              >
                + 자동화 규칙 추가
              </button>
            </div>

            {/* JSON 내보내기 */}
            <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#a78bfa' }}>🚀 서버에 즉시 적용하기</h3>
                <button onClick={handleCopyJSON} className="btn-hover" style={{ background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  {copySuccess ? '✅ 클립보드에 복사됨!' : '📋 데이터 복사'}
                </button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                규칙을 추가하거나 삭제한 후, 위 <strong>[데이터 복사]</strong> 버튼을 눌러 나오는 내용을 <br/>
                Vercel 대시보드의 <strong style={{color:'white'}}>Settings &rarr; Environment Variables &rarr; TRIGGERS_JSON</strong> 에 붙여넣고 다시 배포해야 실제 봇에 반영됩니다.
              </p>
              <pre style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', borderRadius: '12px', padding: '16px', fontSize: '12px', overflow: 'auto', maxHeight: '200px', margin: 0, border: '1px solid rgba(255,255,255,0.05)' }}>
                {triggersJson}
              </pre>
            </div>
          </div>
        )}

        {/* ── 발송 로그 탭 ── */}
        {tab === 'logs' && (
          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'white' }}>실시간 DM 발송 로그</h2>
              <button onClick={fetchData} className="btn-hover" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                🔄 리프레시
              </button>
            </div>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>📡</div>
                <p style={{ color: 'white', fontWeight: 600, fontSize: '16px' }}>아직 감지된 활동이 없습니다</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>봇이 인스타그램 댓글을 모니터링 중입니다.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>발생 시간</th>
                      <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>트리거</th>
                      <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>감지된 키워드</th>
                      <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>유저 ID</th>
                      <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--glass-border)' }}>처리 결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '16px', color: '#cbd5e1' }}>{new Date(log.timestamp).toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: log.trigger === 'comment' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: log.trigger === 'comment' ? '#60a5fa' : '#34d399' }}>
                            {log.trigger === 'comment' ? '💬 댓글 반응' : '📩 다이렉트'}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', fontFamily: 'monospace', color: '#e2e8f0' }}>{log.keyword}</span>
                        </td>
                        <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '12px' }}>{log.userId}</td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: log.success ? '#34d399' : '#f87171', fontWeight: 600 }}>
                            {log.success ? '✅ 전송 완료' : '❌ 전송 실패'}
                          </div>
                          {log.error && <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '4px' }}>{log.error.slice(0, 50)}...</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 설정 가이드 탭 ── */}
        {tab === 'guide' && (
          <div className="glass-card" style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 24px', color: 'white' }}>🚀 필수 인증 및 모드 설정 가이드</h2>

            <div style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(245, 158, 11, 0.2)', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fbbf24', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> 진짜 팔로워에게 봇이 작동하려면? (앱 검수 필수)
              </h3>
              <p style={{ color: '#fde68a', lineHeight: 1.7, margin: 0, fontSize: '15px' }}>
                현재 상태(개발 모드)에서는 <strong>대표님 본인의 인스타 계정</strong>이거나 Meta 앱 대시보드에 <strong>'테스터'로 등록된 사람</strong>이 댓글을 달 때만 정상 작동합니다. <br/><br/>
                실제 팔로워(불특정 다수)가 댓글을 달았을 때 DM이 가도록 하려면, Meta 정책 상 <strong>앱 검수(App Review) 및 비즈니스 인증</strong>을 거쳐 앱을 <strong>라이브(Live) 모드</strong>로 전환해야 합니다.
              </p>
            </div>

            <GuideStep num={1} title="비즈니스 인증 (Business Verification)">
              <p>Meta 개발자 콘솔의 <strong>앱 설정 &rarr; 기본 설정</strong>에서 앱을 비즈니스 포트폴리오에 연결하고 인증을 진행합니다. 사업자 등록증 등의 서류가 필요할 수 있습니다.</p>
            </GuideStep>

            <GuideStep num={2} title="앱 검수 (App Review) 제출">
              <p>개발자 콘솔의 <strong>앱 검수 &rarr; 요청</strong> 메뉴에서 다음 2가지 권한의 검수를 신청해야 합니다:</p>
              <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                <li><code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>instagram_manage_comments</code> : 댓글을 읽기 위해 필요</li>
                <li><code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>instagram_manage_messages</code> : DM을 발송하기 위해 필요</li>
              </ul>
              <p style={{ marginTop: '8px' }}>검수 시 봇이 어떻게 동작하는지 보여주는 짧은 <strong>시연 영상(스크린 레코딩)</strong>과 사용 목적 설명이 필요합니다.</p>
            </GuideStep>

            <GuideStep num={3} title="라이브 모드 켜기">
              <p>검수가 완료되어 권한이 승인되면, 개발자 콘솔 화면 상단의 <strong>[개발 중] 스위치를 눌러 [라이브 모드]로 전환</strong>합니다. 이제 모든 유저를 대상으로 DM 봇이 작동합니다!</p>
            </GuideStep>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: number | string; sub: string; color: string }) {
  return (
    <div className="glass-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '60px', opacity: 0.1, filter: 'grayscale(100%)' }}>{icon}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
          {icon}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: color, fontWeight: 600 }}>{sub}</div>
    </div>
  );
}

function GuideStep({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px', flexShrink: 0, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '4px 0 12px', color: 'white' }}>{title}</h3>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}
