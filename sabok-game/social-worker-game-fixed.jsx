import React, { useState, useEffect, useCallback } from 'react';
import { Home, TrendingUp, Award, Briefcase, X } from 'lucide-react';

export default function RaiseSocialWorker() {
  const [currentScreen, setCurrentScreen] = useState('character-select');
  const [gender, setGender] = useState(null);
  const [userId, setUserId] = useState(null);
  
  // 게임 상태
  const [experience, setExperience] = useState(0);
  const [level, setLevel] = useState(1);
  const [money, setMoney] = useState(450);
  const [clickPower, setClickPower] = useState(1);
  const [autoIncome, setAutoIncome] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  
  // 케이스 시스템
  const [currentCase, setCurrentCase] = useState(null);
  const [casesCompleted, setCasesCompleted] = useState({
    child: 0,
    elderly: 0,
    disability: 0,
    mental: 0,
    family: 0
  });
  
  // 미니게임
  const [activeMinigame, setActiveMinigame] = useState(null);
  const [minigameData, setMinigameData] = useState(null);
  
  // 업그레이드
  const [skills, setSkills] = useState({
    empathy: 0,
    documentation: 0,
    networking: 0,
    counseling: 0,
    crisis: 0
  });
  
  const [equipment, setEquipment] = useState({
    chair: 0,
    computer: 0,
    coffee: 0,
    bookshelf: 0,
    plant: 0,
    sofa: 0
  });

  const [clickAnimation, setClickAnimation] = useState(false);
  const [floatingNumbers, setFloatingNumbers] = useState([]);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);

  // 직급 정보
  const ranks = [
    { name: '인턴', minLevel: 1, salary: 50, office: 'starter' },
    { name: '사회복지사', minLevel: 10, salary: 100, office: 'basic' },
    { name: '선임 사회복지사', minLevel: 20, salary: 200, office: 'intermediate' },
    { name: '팀장', minLevel: 30, salary: 400, office: 'advanced' },
    { name: '과장', minLevel: 40, salary: 800, office: 'manager' },
    { name: '부장', minLevel: 50, salary: 1600, office: 'senior' },
    { name: '센터장', minLevel: 60, salary: 3200, office: 'director' }
  ];

  const getCurrentRank = () => {
    return [...ranks].reverse().find(r => level >= r.minLevel) || ranks[0];
  };

  // 케이스 타입
  const caseTypes = [
    { 
      id: 'child', 
      name: '아동복지', 
      icon: '👶',
      color: 'from-pink-400 to-rose-500',
      bonus: 1.2,
      description: '아동 보호 및 지원'
    },
    { 
      id: 'elderly', 
      name: '노인복지', 
      icon: '👴',
      color: 'from-amber-400 to-orange-500',
      bonus: 1.3,
      description: '노인 돌봄 서비스'
    },
    { 
      id: 'disability', 
      name: '장애인복지', 
      icon: '♿',
      color: 'from-blue-400 to-indigo-500',
      bonus: 1.4,
      description: '장애인 지원 서비스'
    },
    { 
      id: 'mental', 
      name: '정신건강', 
      icon: '🧠',
      color: 'from-purple-400 to-violet-500',
      bonus: 1.5,
      description: '정신건강 상담'
    },
    { 
      id: 'family', 
      name: '가족복지', 
      icon: '👨‍👩‍👧‍👦',
      color: 'from-green-400 to-emerald-500',
      bonus: 1.3,
      description: '가족 지원 서비스'
    }
  ];

  // 스킬 정보
  const skillsData = [
    { 
      id: 'empathy', 
      name: '공감능력', 
      icon: '❤️',
      description: '클릭 파워 +5',
      cost: (lvl) => Math.floor(150 * Math.pow(1.5, lvl))
    },
    { 
      id: 'documentation', 
      name: '문서작성', 
      icon: '📄',
      description: '자동 수입 +10',
      cost: (lvl) => Math.floor(200 * Math.pow(1.6, lvl))
    },
    { 
      id: 'networking', 
      name: '네트워킹', 
      icon: '🤝',
      description: '경험치 +15%',
      cost: (lvl) => Math.floor(300 * Math.pow(1.7, lvl))
    },
    { 
      id: 'counseling', 
      name: '상담기술', 
      icon: '💬',
      description: '케이스 보너스 +10%',
      cost: (lvl) => Math.floor(250 * Math.pow(1.6, lvl))
    },
    { 
      id: 'crisis', 
      name: '위기개입', 
      icon: '🚨',
      description: '특수 케이스 보너스 +20%',
      cost: (lvl) => Math.floor(400 * Math.pow(1.8, lvl))
    }
  ];

  // 장비 정보
  const equipmentData = [
    { 
      id: 'chair', 
      name: '좋은 의자', 
      icon: '💺',
      description: '편안함 +20%',
      cost: (lvl) => Math.floor(100 * Math.pow(1.4, lvl))
    },
    { 
      id: 'computer', 
      name: '빠른 컴퓨터', 
      icon: '💻',
      description: '자동 수입 +15',
      cost: (lvl) => Math.floor(250 * Math.pow(1.5, lvl))
    },
    { 
      id: 'coffee', 
      name: '커피머신', 
      icon: '☕',
      description: '클릭 파워 +10',
      cost: (lvl) => Math.floor(500 * Math.pow(1.6, lvl))
    },
    { 
      id: 'bookshelf', 
      name: '전문서적', 
      icon: '📚',
      description: '경험치 +10%',
      cost: (lvl) => Math.floor(800 * Math.pow(1.7, lvl))
    },
    { 
      id: 'plant', 
      name: '관엽식물', 
      icon: '🪴',
      description: '행복도 +5%',
      cost: (lvl) => Math.floor(300 * Math.pow(1.4, lvl))
    },
    { 
      id: 'sofa', 
      name: '상담 소파', 
      icon: '🛋️',
      description: '상담 효율 +25%',
      cost: (lvl) => Math.floor(1000 * Math.pow(1.8, lvl))
    }
  ];

  // 초기화
  useEffect(() => {
    let storedUserId = localStorage.getItem('socialWorkerUserId');
    if (!storedUserId) {
      storedUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('socialWorkerUserId', storedUserId);
    }
    setUserId(storedUserId);

    // 저장된 게임 데이터 로드
    const savedData = localStorage.getItem(`gameData_${storedUserId}`);
    if (savedData) {
      const data = JSON.parse(savedData);
      setGender(data.gender);
      setExperience(data.experience || 0);
      setLevel(data.level || 1);
      setMoney(data.money || 450);
      setClickPower(data.clickPower || 1);
      setAutoIncome(data.autoIncome || 0);
      setTotalClicks(data.totalClicks || 0);
      setSkills(data.skills || { empathy: 0, documentation: 0, networking: 0, counseling: 0, crisis: 0 });
      setEquipment(data.equipment || { chair: 0, computer: 0, coffee: 0, bookshelf: 0, plant: 0, sofa: 0 });
      setCasesCompleted(data.casesCompleted || { child: 0, elderly: 0, disability: 0, mental: 0, family: 0 });
      
      if (data.gender) {
        setCurrentScreen('game');
      }
    }
  }, []);

  // 게임 데이터 저장
  const saveGameData = useCallback(() => {
    if (!userId) return;

    const gameData = {
      gender,
      experience,
      level,
      money,
      clickPower,
      autoIncome,
      totalClicks,
      skills,
      equipment,
      casesCompleted,
      lastSaved: Date.now()
    };

    localStorage.setItem(`gameData_${userId}`, JSON.stringify(gameData));
    
    setShowSaveIndicator(true);
    setTimeout(() => setShowSaveIndicator(false), 2000);
  }, [userId, gender, experience, level, money, clickPower, autoIncome, totalClicks, skills, equipment, casesCompleted]);

  // 자동 저장 (30초마다)
  useEffect(() => {
    if (userId && gender) {
      const interval = setInterval(() => {
        saveGameData();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [userId, gender, saveGameData]);

  // 자동 수입
  useEffect(() => {
    if (autoIncome > 0) {
      const interval = setInterval(() => {
        const income = autoIncome;
        setExperience(prev => prev + income);
        setMoney(prev => prev + income * 0.5);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [autoIncome]);

  // 레벨업 체크
  useEffect(() => {
    const expNeeded = level * 1000;
    if (experience >= expNeeded) {
      setExperience(prev => prev - expNeeded);
      setLevel(prev => prev + 1);
      
      // 레벨업 시 보상
      setMoney(prev => prev + level * 100);
    }
  }, [experience, level]);

  // 랜덤 케이스 생성 (랜덤 시간마다)
  useEffect(() => {
    const scheduleNextCase = () => {
      // 3초 ~ 15초 사이 랜덤
      const randomDelay = Math.random() * 12000 + 3000;
      
      setTimeout(() => {
        if (!currentCase && Math.random() > 0.2) {
          const randomCase = caseTypes[Math.floor(Math.random() * caseTypes.length)];
          setCurrentCase(randomCase);
        }
        scheduleNextCase();
      }, randomDelay);
    };

    scheduleNextCase();
  }, []);

  // 클릭 핸들러
  const handleWork = (e) => {
    const baseEarnings = clickPower * (1 + skills.networking * 0.15);
    const caseBonus = currentCase ? currentCase.bonus : 1;
    const counselingBonus = 1 + skills.counseling * 0.1;
    const earnings = baseEarnings * caseBonus * counselingBonus;
    
    setExperience(prev => prev + earnings);
    setMoney(prev => prev + earnings * 0.5);
    setTotalClicks(prev => prev + 1);
    
    if (currentCase) {
      setCasesCompleted(prev => ({
        ...prev,
        [currentCase.id]: prev[currentCase.id] + 1
      }));
      setCurrentCase(null);
    }
    
    setClickAnimation(true);
    setTimeout(() => setClickAnimation(false), 200);

    // 떠오르는 숫자
    const id = Date.now();
    setFloatingNumbers(prev => [...prev, { 
      id, 
      value: `+${Math.floor(earnings)}`,
      x: Math.random() * 200 - 100,
      y: -50
    }]);
    setTimeout(() => {
      setFloatingNumbers(prev => prev.filter(n => n.id !== id));
    }, 1000);
  };

  // 스킬 업그레이드
  const upgradeSkill = (skillId) => {
    const skill = skillsData.find(s => s.id === skillId);
    const cost = skill.cost(skills[skillId]);
    
    if (money >= cost) {
      setMoney(prev => prev - cost);
      setSkills(prev => ({ ...prev, [skillId]: prev[skillId] + 1 }));
      
      if (skillId === 'empathy') setClickPower(prev => prev + 5);
      if (skillId === 'documentation') setAutoIncome(prev => prev + 10);
    }
  };

  // 장비 업그레이드
  const upgradeEquipment = (equipId) => {
    const equip = equipmentData.find(e => e.id === equipId);
    const cost = equip.cost(equipment[equipId]);
    
    if (money >= cost) {
      setMoney(prev => prev - cost);
      setEquipment(prev => ({ ...prev, [equipId]: prev[equipId] + 1 }));
      
      if (equipId === 'computer') setAutoIncome(prev => prev + 15);
      if (equipId === 'coffee') setClickPower(prev => prev + 10);
    }
  };

  // 미니게임 시작
  const startMinigame = (gameType) => {
    if (gameType === 'counseling') {
      // 상담 미니게임
      const scenarios = [
        {
          question: '클라이언트가 "아무도 날 이해 못해요"라고 말합니다.',
          options: [
            { text: '"제가 이해합니다"', correct: false, feedback: '공감보다는 경청이 중요합니다.' },
            { text: '"그런 기분이 드시는군요. 더 말씀해주시겠어요?"', correct: true, feedback: '훌륭한 경청과 공감입니다!' },
            { text: '"다른 사람들도 다 그렇게 생각해요"', correct: false, feedback: '클라이언트의 감정을 축소시킬 수 있습니다.' }
          ]
        },
        {
          question: '클라이언트가 위기 상황에 있다고 판단됩니다.',
          options: [
            { text: '즉시 상급자에게 보고', correct: true, feedback: '올바른 위기 대응입니다!' },
            { text: '혼자 해결하려 시도', correct: false, feedback: '위기 상황은 팀으로 대응해야 합니다.' },
            { text: '다음 상담 때 다시 보기', correct: false, feedback: '위기는 즉각 대응이 필요합니다.' }
          ]
        },
        {
          question: '클라이언트가 계속 침묵하고 있습니다.',
          options: [
            { text: '"왜 말을 안 하세요?"', correct: false, feedback: '압박적으로 느껴질 수 있습니다.' },
            { text: '함께 침묵하며 기다리기', correct: true, feedback: '침묵도 의미있는 소통입니다!' },
            { text: '다른 주제로 전환', correct: false, feedback: '클라이언트의 페이스를 존중해야 합니다.' }
          ]
        }
      ];
      
      const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
      setMinigameData(randomScenario);
      setActiveMinigame('counseling');
    } else if (gameType === 'typing') {
      // 타이핑 게임
      const documents = [
        '사회복지서비스 신청서',
        '사례관리 계획서',
        '복지급여 신청 접수',
        '상담 기록지 작성',
        '가정방문 보고서',
        '욕구사정 보고서'
      ];
      
      setMinigameData({
        document: documents[Math.floor(Math.random() * documents.length)],
        timeLeft: 10,
        completed: false,
        maxTime: 10
      });
      setActiveMinigame('typing');
    } else if (gameType === 'quiz') {
      // 복지급여 계산 퀴즈
      const baseAmount = Math.floor(Math.random() * 500000) + 1500000;
      setMinigameData({
        question: '기초생활수급자 4인 가구의 생계급여 기준은?',
        answer: baseAmount,
        tolerance: 200000
      });
      setActiveMinigame('quiz');
    }
  };

  // 타이핑 게임 타이머
  useEffect(() => {
    if (activeMinigame === 'typing' && minigameData && minigameData.timeLeft > 0 && !minigameData.completed) {
      const timer = setTimeout(() => {
        setMinigameData(prev => ({
          ...prev,
          timeLeft: prev.timeLeft - 1
        }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeMinigame, minigameData]);

  // 미니게임 답변
  const answerMinigame = (answer) => {
    if (activeMinigame === 'counseling') {
      if (answer.correct) {
        const reward = 500 * (1 + skills.counseling * 0.5);
        setMoney(prev => prev + reward);
        setExperience(prev => prev + reward);
        setMinigameData({ ...minigameData, result: { success: true, message: answer.feedback, reward } });
      } else {
        setMinigameData({ ...minigameData, result: { success: false, message: answer.feedback, reward: 0 } });
      }
    } else if (activeMinigame === 'typing') {
      if (minigameData.timeLeft > 0) {
        const reward = 300 * minigameData.timeLeft;
        setMoney(prev => prev + reward);
        setExperience(prev => prev + reward);
        setMinigameData({ ...minigameData, completed: true, result: { success: true, message: `완료! 남은 시간: ${minigameData.timeLeft}초`, reward } });
      } else {
        setMinigameData({ ...minigameData, completed: true, result: { success: false, message: '시간 초과!', reward: 0 } });
      }
    } else if (activeMinigame === 'quiz') {
      const diff = Math.abs(answer - minigameData.answer);
      if (diff <= minigameData.tolerance) {
        const reward = 1000;
        setMoney(prev => prev + reward);
        setExperience(prev => prev + reward);
        setMinigameData({ ...minigameData, result: { success: true, message: '정답!', reward } });
      } else {
        setMinigameData({ ...minigameData, result: { success: false, message: `오답! 정답은 약 ${minigameData.answer.toLocaleString()}원입니다.`, reward: 0 } });
      }
    }
  };

  // 미니게임 닫기
  const closeMinigame = () => {
    setActiveMinigame(null);
    setMinigameData(null);
  };

  const currentRank = getCurrentRank();
  const expNeeded = level * 1000;
  const expProgress = (experience / expNeeded) * 100;

  // 사무실 렌더링
  const renderOffice = () => {
    return (
      <svg width="300" height="250" viewBox="0 0 300 250" className="mx-auto">
        {/* 바닥 */}
        <polygon points="50,150 250,150 280,200 20,200" fill="#D7CCC8"/>
        <polygon points="50,150 80,100 280,100 250,150" fill="#BCAAA4"/>
        <polygon points="250,150 280,100 280,200 250,200" fill="#A1887F"/>
        
        {/* 레벨별 가구 */}
        {level >= 10 && (
          <>
            {/* 파티션 */}
            <rect x="200" y="120" width="4" height="60" fill="#8D6E63"/>
            <rect x="200" y="120" width="60" height="4" fill="#8D6E63"/>
          </>
        )}
        
        {/* 책상 */}
        <polygon points="80,130 180,130 190,145 70,145" fill="#8B4513"/>
        <polygon points="80,130 100,110 200,110 180,130" fill="#A0522D"/>
        <polygon points="180,130 200,110 200,145 180,145" fill="#654321"/>
        
        {/* 컴퓨터 */}
        <rect x="110" y="100" width="60" height="40" fill="#2C3E50"/>
        <rect x="115" y="105" width="50" height="30" fill={equipment.computer > 0 ? "#3498DB" : "#34495E"}/>
        
        {/* 의자 */}
        <ellipse cx="150" cy="170" rx="20" ry="8" fill={equipment.chair > 0 ? "#E74C3C" : "#95A5A6"}/>
        <rect x="147" y="155" width="6" height="15" fill="#7F8C8D"/>
        
        {level >= 20 && (
          <>
            {/* 화분 */}
            {equipment.plant > 0 && (
              <>
                <ellipse cx="230" cy="140" rx="10" ry="5" fill="#8B4513"/>
                <polygon points="230,125 225,135 235,135" fill="#27AE60"/>
                <polygon points="230,120 222,132 238,132" fill="#2ECC71"/>
              </>
            )}
            
            {/* 서류함 */}
            <rect x="210" y="135" width="25" height="35" fill="#7F8C8D"/>
            <rect x="212" y="140" width="21" height="8" fill="#95A5A6"/>
            <rect x="212" y="152" width="21" height="8" fill="#95A5A6"/>
          </>
        )}
        
        {level >= 30 && (
          <>
            {/* 책장 */}
            {equipment.bookshelf > 0 && (
              <>
                <rect x="40" y="100" width="30" height="50" fill="#8B4513"/>
                <rect x="42" y="105" width="26" height="10" fill="#C0392B"/>
                <rect x="42" y="118" width="26" height="10" fill="#2980B9"/>
                <rect x="42" y="131" width="26" height="10" fill="#27AE60"/>
              </>
            )}
            
            {/* 창문 (도시 전망) */}
            <rect x="10" y="60" width="40" height="50" fill="#85C1E9"/>
            <line x1="10" y1="85" x2="50" y2="85" stroke="#34495E" strokeWidth="2"/>
            <line x1="30" y1="60" x2="30" y2="110" stroke="#34495E" strokeWidth="2"/>
          </>
        )}
        
        {level >= 40 && (
          <>
            {/* 소파 */}
            {equipment.sofa > 0 && (
              <>
                <rect x="220" y="160" width="50" height="20" fill="#8E44AD"/>
                <rect x="215" y="155" width="10" height="25" fill="#9B59B6"/>
                <rect x="265" y="155" width="10" height="25" fill="#9B59B6"/>
              </>
            )}
          </>
        )}
        
        {level >= 50 && (
          <>
            {/* 액자 (그림) */}
            <rect x="15" y="40" width="30" height="20" fill="#F39C12"/>
            <rect x="17" y="42" width="26" height="16" fill="#E67E22"/>
            
            {/* 커피머신 */}
            {equipment.coffee > 0 && (
              <>
                <rect x="260" y="125" width="15" height="20" fill="#34495E"/>
                <rect x="262" y="127" width="11" height="8" fill="#E74C3C"/>
              </>
            )}
          </>
        )}
      </svg>
    );
  };

  // 캐릭터 선택 화면
  if (currentScreen === 'character-select' && !gender) {
    return (
      <div className="h-screen bg-gradient-to-b from-amber-100 to-orange-200 flex items-center justify-center p-4 overflow-hidden">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
          
          * {
            font-family: 'Noto Sans KR', sans-serif;
          }
          
          .wood-panel {
            background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
            border: 8px solid #654321;
            border-radius: 12px;
            box-shadow: 
              inset 0 2px 4px rgba(255,255,255,0.3),
              inset 0 -2px 4px rgba(0,0,0,0.3),
              0 8px 16px rgba(0,0,0,0.3);
          }
          
          .gold-border {
            border: 6px solid #DAA520;
            border-radius: 12px;
            box-shadow: 
              inset 0 2px 4px rgba(255,215,0,0.5),
              0 4px 8px rgba(0,0,0,0.2);
          }
          
          .character-card {
            background: linear-gradient(135deg, #FFF8DC 0%, #F5DEB3 100%);
            transition: all 0.3s ease;
          }
          
          .character-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 12px 24px rgba(0,0,0,0.3);
          }
        `}</style>

        <div className="wood-panel p-8 max-w-2xl w-full relative z-10">
          <div className="text-center mb-8">
            <div className="inline-block px-8 py-4" style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              border: '4px solid #8B4513',
              borderRadius: '8px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
            }}>
              <h1 className="text-4xl font-black text-amber-900" style={{
                textShadow: '2px 2px 0 rgba(255,255,255,0.5)'
              }}>
                캐릭터를 선택하세요
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => {
                setGender('male');
                setCurrentScreen('game');
              }}
              className="character-card gold-border p-6 group"
            >
              <div className="w-40 h-40 mx-auto mb-4 relative">
                <svg viewBox="0 0 80 80" className="w-full h-full">
                  <rect x="24" y="8" width="32" height="8" fill="#8B4513"/>
                  <rect x="24" y="16" width="32" height="8" fill="#A0522D"/>
                  <rect x="24" y="24" width="32" height="16" fill="#F5CBA7"/>
                  <rect x="32" y="28" width="4" height="4" fill="#000"/>
                  <rect x="44" y="28" width="4" height="4" fill="#000"/>
                  <rect x="36" y="36" width="8" height="2" fill="#C0392B"/>
                  <rect x="24" y="40" width="32" height="16" fill="#3498DB"/>
                  <rect x="24" y="56" width="14" height="16" fill="#2C3E50"/>
                  <rect x="42" y="56" width="14" height="16" fill="#2C3E50"/>
                  <rect x="24" y="72" width="14" height="4" fill="#000"/>
                  <rect x="42" y="72" width="14" height="4" fill="#000"/>
                </svg>
              </div>
              
              <div className="text-center">
                <div className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg">
                  <span className="text-2xl font-bold text-white">선택</span>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setGender('female');
                setCurrentScreen('game');
              }}
              className="character-card gold-border p-6 group"
            >
              <div className="w-40 h-40 mx-auto mb-4 relative">
                <svg viewBox="0 0 80 80" className="w-full h-full">
                  <rect x="20" y="8" width="40" height="8" fill="#654321"/>
                  <rect x="20" y="16" width="40" height="8" fill="#8B4513"/>
                  <rect x="24" y="24" width="32" height="16" fill="#FFDAB9"/>
                  <rect x="32" y="28" width="4" height="4" fill="#000"/>
                  <rect x="44" y="28" width="4" height="4" fill="#000"/>
                  <rect x="36" y="36" width="8" height="2" fill="#E74C3C"/>
                  <rect x="24" y="40" width="32" height="16" fill="#E91E63"/>
                  <rect x="24" y="56" width="32" height="12" fill="#9C27B0"/>
                  <rect x="28" y="68" width="8" height="4" fill="#FFDAB9"/>
                  <rect x="44" y="68" width="8" height="4" fill="#FFDAB9"/>
                  <rect x="28" y="72" width="8" height="4" fill="#C0392B"/>
                  <rect x="44" y="72" width="8" height="4" fill="#C0392B"/>
                </svg>
              </div>
              
              <div className="text-center">
                <div className="inline-block px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg">
                  <span className="text-2xl font-bold text-white">선택</span>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-lg text-amber-100 font-bold">
              사회복지사 키우기
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 메인 게임 화면
  return (
    <div className="h-screen bg-gradient-to-b from-sky-400 to-sky-300 flex flex-col overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
        
        * {
          font-family: 'Noto Sans KR', sans-serif;
        }
        
        .gold-frame {
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
          border: 4px solid #B8860B;
          border-radius: 12px;
          box-shadow: 
            inset 0 2px 4px rgba(255,255,255,0.5),
            0 4px 12px rgba(0,0,0,0.3);
        }
        
        .work-button {
          background: linear-gradient(135deg, #FFD700 0%, #FF8C00 100%);
          border: 6px solid #8B4513;
          border-radius: 16px;
          box-shadow: 
            inset 0 4px 8px rgba(255,255,255,0.3),
            0 8px 16px rgba(0,0,0,0.4);
          transition: all 0.2s ease;
        }
        
        .work-button:active {
          transform: translateY(4px);
          box-shadow: 
            inset 0 4px 8px rgba(255,255,255,0.3),
            0 4px 8px rgba(0,0,0,0.4);
        }
        
        .nav-button {
          background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
          border: 3px solid #654321;
          transition: all 0.2s ease;
        }
        
        .nav-button.active {
          background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
          border-color: #B8860B;
        }
        
        .floating-number {
          animation: float-up 1s ease-out forwards;
          pointer-events: none;
        }
        
        @keyframes float-up {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-60px) scale(1.2);
          }
        }
      `}</style>

      {/* 미니게임 모달 */}
      {activeMinigame && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={closeMinigame}
              className="absolute top-4 right-4 p-2 hover:bg-gray-200 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>

            {activeMinigame === 'counseling' && minigameData && (
              <>
                <h2 className="text-2xl font-black text-gray-800 mb-4">상담 시나리오</h2>
                <p className="text-lg mb-6 text-gray-700">{minigameData.question}</p>
                
                {!minigameData.result ? (
                  <div className="space-y-3">
                    {minigameData.options.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => answerMinigame(option)}
                        className="w-full p-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-bold hover:scale-105 transition-transform text-left"
                      >
                        {option.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`p-6 rounded-lg ${minigameData.result.success ? 'bg-green-100' : 'bg-red-100'}`}>
                    <div className={`text-2xl font-black mb-2 ${minigameData.result.success ? 'text-green-700' : 'text-red-700'}`}>
                      {minigameData.result.success ? '✓ 정답!' : '✗ 오답'}
                    </div>
                    <p className="text-gray-700 mb-4">{minigameData.result.message}</p>
                    {minigameData.result.reward > 0 && (
                      <div className="text-xl font-bold text-green-600">
                        +{Math.floor(minigameData.result.reward)}원
                      </div>
                    )}
                    <button
                      onClick={closeMinigame}
                      className="mt-4 w-full p-3 bg-gray-800 text-white rounded-lg font-bold"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </>
            )}

            {activeMinigame === 'typing' && minigameData && (
              <>
                <h2 className="text-2xl font-black text-gray-800 mb-4">문서 작성</h2>
                <p className="text-lg mb-4 text-gray-700">{minigameData.document}</p>
                
                {!minigameData.result ? (
                  <>
                    <div className="text-6xl font-black text-center mb-6 text-blue-600">
                      {minigameData.timeLeft}
                    </div>
                    <div className="h-4 bg-gray-200 rounded-full mb-6">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
                        style={{ width: `${(minigameData.timeLeft / minigameData.maxTime) * 100}%` }}
                      />
                    </div>
                    {minigameData.timeLeft > 0 ? (
                      <button
                        onClick={() => answerMinigame(true)}
                        className="w-full p-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-xl hover:scale-105 transition-transform"
                      >
                        작성 완료!
                      </button>
                    ) : (
                      <div className="text-center text-red-600 font-bold text-xl">
                        시간 초과!
                      </div>
                    )}
                  </>
                ) : (
                  <div className={`p-6 rounded-lg ${minigameData.result.success ? 'bg-green-100' : 'bg-red-100'}`}>
                    <div className={`text-2xl font-black mb-2 ${minigameData.result.success ? 'text-green-700' : 'text-red-700'}`}>
                      {minigameData.result.success ? '✓ 완료!' : '✗ 실패'}
                    </div>
                    <p className="text-gray-700 mb-4">{minigameData.result.message}</p>
                    {minigameData.result.reward > 0 && (
                      <div className="text-xl font-bold text-green-600">
                        +{Math.floor(minigameData.result.reward)}원
                      </div>
                    )}
                    <button
                      onClick={closeMinigame}
                      className="mt-4 w-full p-3 bg-gray-800 text-white rounded-lg font-bold"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </>
            )}

            {activeMinigame === 'quiz' && minigameData && (
              <>
                <h2 className="text-2xl font-black text-gray-800 mb-4">복지급여 계산</h2>
                <p className="text-lg mb-6 text-gray-700">{minigameData.question}</p>
                
                {!minigameData.result ? (
                  <>
                    <input
                      type="number"
                      id="quizInput"
                      className="w-full p-4 border-4 border-gray-300 rounded-lg text-xl mb-4"
                      placeholder="금액 입력 (원)"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          answerMinigame(parseInt(e.target.value) || 0);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('quizInput');
                        answerMinigame(parseInt(input.value) || 0);
                      }}
                      className="w-full p-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-bold hover:scale-105 transition-transform"
                    >
                      제출
                    </button>
                  </>
                ) : (
                  <div className={`p-6 rounded-lg ${minigameData.result.success ? 'bg-green-100' : 'bg-red-100'}`}>
                    <div className={`text-2xl font-black mb-2 ${minigameData.result.success ? 'text-green-700' : 'text-red-700'}`}>
                      {minigameData.result.success ? '✓ 정답!' : '✗ 오답'}
                    </div>
                    <p className="text-gray-700 mb-4">{minigameData.result.message}</p>
                    {minigameData.result.reward > 0 && (
                      <div className="text-xl font-bold text-green-600">
                        +{minigameData.result.reward}원
                      </div>
                    )}
                    <button
                      onClick={closeMinigame}
                      className="mt-4 w-full p-3 bg-gray-800 text-white rounded-lg font-bold"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 저장 표시 */}
      {showSaveIndicator && (
        <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg font-bold z-50 shadow-lg">
          ✓ 자동 저장됨
        </div>
      )}

      {/* 상단 헤더 */}
      <div className="gold-frame m-4 p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-2xl font-black text-amber-900 mb-1">
              사회복지사 키우기
            </div>
            <div className="text-sm font-bold text-blue-900">
              직급: {currentRank.name}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-green-700">
              💰 {money.toLocaleString()}원
            </div>
            <button
              onClick={saveGameData}
              className="text-xs font-bold text-blue-700 hover:text-blue-900"
            >
              수동 저장
            </button>
          </div>
        </div>
        
        <div className="mt-3">
          <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
            <span>LVL {level}</span>
            <span>{Math.floor(expProgress)}% 다음 레벨까지</span>
          </div>
          <div className="h-6 bg-gradient-to-r from-blue-800 to-blue-900 rounded-full overflow-hidden border-4 border-blue-950">
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300"
              style={{ width: `${expProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 - 스크롤 가능 */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {currentScreen === 'game' && (
          <div className="space-y-4">
            {/* 현재 케이스 알림 */}
            {currentCase && (
              <div className={`gold-frame p-4 bg-gradient-to-r ${currentCase.color} animate-pulse`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{currentCase.icon}</div>
                    <div>
                      <div className="font-black text-white text-lg">
                        긴급 케이스!
                      </div>
                      <div className="text-sm text-white">
                        {currentCase.name} - 보너스 {((currentCase.bonus - 1) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ×{currentCase.bonus.toFixed(1)}
                  </div>
                </div>
              </div>
            )}

            {/* 사무실 영역 */}
            <div className="gold-frame p-6 relative overflow-hidden" style={{
              background: 'linear-gradient(135deg, #F5E6D3 0%, #D7CCC8 100%)'
            }}>
              <div className="relative min-h-[300px]">
                {floatingNumbers.map(num => (
                  <div
                    key={num.id}
                    className="absolute text-3xl font-black text-green-500 floating-number"
                    style={{
                      left: '50%',
                      top: '30%',
                      marginLeft: num.x,
                      textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                    }}
                  >
                    {num.value}
                  </div>
                ))}

                {renderOffice()}

                <div className="text-center mt-4">
                  <div className="w-32 h-32 mx-auto mb-4">
                    <svg viewBox="0 0 80 80" className="w-full h-full">
                      {gender === 'male' ? (
                        <>
                          <rect x="24" y="8" width="32" height="8" fill="#8B4513"/>
                          <rect x="24" y="16" width="32" height="8" fill="#A0522D"/>
                          <rect x="24" y="24" width="32" height="16" fill="#F5CBA7"/>
                          <rect x="32" y="28" width="4" height="4" fill="#000"/>
                          <rect x="44" y="28" width="4" height="4" fill="#000"/>
                          <rect x="36" y="36" width="8" height="2" fill="#C0392B"/>
                          <rect x="24" y="40" width="32" height="16" fill={level >= 20 ? "#2C3E50" : "#3498DB"}/>
                          <rect x="24" y="56" width="14" height="16" fill={level >= 30 ? "#34495E" : "#2C3E50"}/>
                          <rect x="42" y="56" width="14" height="16" fill={level >= 30 ? "#34495E" : "#2C3E50"}/>
                          <rect x="24" y="72" width="14" height="4" fill="#000"/>
                          <rect x="42" y="72" width="14" height="4" fill="#000"/>
                        </>
                      ) : (
                        <>
                          <rect x="20" y="8" width="40" height="8" fill="#654321"/>
                          <rect x="20" y="16" width="40" height="8" fill="#8B4513"/>
                          <rect x="24" y="24" width="32" height="16" fill="#FFDAB9"/>
                          <rect x="32" y="28" width="4" height="4" fill="#000"/>
                          <rect x="44" y="28" width="4" height="4" fill="#000"/>
                          <rect x="36" y="36" width="8" height="2" fill="#E74C3C"/>
                          <rect x="24" y="40" width="32" height="16" fill={level >= 20 ? "#5D4037" : "#E91E63"}/>
                          <rect x="24" y="56" width="32" height="12" fill={level >= 30 ? "#424242" : "#9C27B0"}/>
                          <rect x="28" y="68" width="8" height="4" fill="#FFDAB9"/>
                          <rect x="44" y="68" width="8" height="4" fill="#FFDAB9"/>
                          <rect x="28" y="72" width="8" height="4" fill="#C0392B"/>
                          <rect x="44" y="72" width="8" height="4" fill="#C0392B"/>
                        </>
                      )}
                    </svg>
                  </div>
                </div>
              </div>

              <div className="text-center mt-6">
                <button
                  onClick={handleWork}
                  className={`work-button px-16 py-6 ${clickAnimation ? 'scale-95' : ''}`}
                >
                  <div className="text-4xl font-black text-amber-900" style={{
                    textShadow: '2px 2px 0 rgba(255,255,255,0.5)'
                  }}>
                    업무
                  </div>
                </button>
              </div>

              <div className="text-center mt-4 space-y-1">
                <div className="text-sm font-bold text-gray-700">
                  클릭당 +{clickPower} 경험치
                </div>
                {autoIncome > 0 && (
                  <div className="text-sm font-bold text-green-700">
                    초당 +{autoIncome} 자동 수입
                  </div>
                )}
                <div className="text-xs text-gray-600">
                  총 {totalClicks}번 클릭
                </div>
              </div>
            </div>

            {/* 미니게임 버튼 */}
            <div className="gold-frame p-4">
              <h3 className="text-xl font-black text-amber-900 mb-3">미니게임</h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => startMinigame('counseling')}
                  className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg text-white font-bold hover:scale-105 transition-transform"
                >
                  <div className="text-2xl mb-1">💬</div>
                  <div className="text-xs">상담</div>
                </button>
                <button
                  onClick={() => startMinigame('typing')}
                  className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg text-white font-bold hover:scale-105 transition-transform"
                >
                  <div className="text-2xl mb-1">⌨️</div>
                  <div className="text-xs">문서작성</div>
                </button>
                <button
                  onClick={() => startMinigame('quiz')}
                  className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white font-bold hover:scale-105 transition-transform"
                >
                  <div className="text-2xl mb-1">🧮</div>
                  <div className="text-xs">계산</div>
                </button>
              </div>
            </div>

            {/* 케이스 통계 */}
            <div className="gold-frame p-4">
              <h3 className="text-xl font-black text-amber-900 mb-3">완료한 케이스</h3>
              <div className="grid grid-cols-2 gap-3">
                {caseTypes.map(caseType => (
                  <div key={caseType.id} className={`p-3 bg-gradient-to-r ${caseType.color} rounded-lg`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{caseType.icon}</span>
                        <span className="text-white font-bold text-sm">{caseType.name}</span>
                      </div>
                      <span className="text-white font-black text-lg">
                        {casesCompleted[caseType.id]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 스킬 업그레이드 */}
            <div className="gold-frame p-4">
              <h2 className="text-2xl font-black text-amber-900 mb-4 flex items-center gap-2">
                <Award className="w-6 h-6" />
                스킬
              </h2>
              
              <div className="space-y-3">
                {skillsData.map(skill => {
                  const currentLevel = skills[skill.id];
                  const cost = skill.cost(currentLevel);
                  const canAfford = money >= cost;
                  
                  return (
                    <button
                      key={skill.id}
                      onClick={() => upgradeSkill(skill.id)}
                      disabled={!canAfford}
                      className={`w-full p-4 rounded-lg border-4 transition-all ${
                        canAfford
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-green-700 hover:scale-102'
                          : 'bg-gray-400 border-gray-600 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">{skill.icon}</div>
                          <div className="text-left">
                            <div className="font-bold text-white text-lg">
                              {skill.name}
                            </div>
                            <div className="text-sm text-gray-100">
                              {skill.description}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-yellow-300">
                            Lv.{currentLevel}
                          </div>
                          <div className="text-sm font-bold text-yellow-200">
                            💰 {cost}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사무실 장비 */}
            <div className="gold-frame p-4">
              <h2 className="text-2xl font-black text-amber-900 mb-4 flex items-center gap-2">
                <Briefcase className="w-6 h-6" />
                사무실 장비
              </h2>
              <div className="space-y-3">
                {equipmentData.map(equip => {
                  const currentLevel = equipment[equip.id];
                  const cost = equip.cost(currentLevel);
                  const canAfford = money >= cost;
                  
                  return (
                    <button
                      key={equip.id}
                      onClick={() => upgradeEquipment(equip.id)}
                      disabled={!canAfford}
                      className={`w-full p-4 rounded-lg border-4 transition-all ${
                        canAfford
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 border-blue-700 hover:scale-102'
                          : 'bg-gray-400 border-gray-600 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">{equip.icon}</div>
                          <div className="text-left">
                            <div className="font-bold text-white text-lg">
                              {equip.name}
                            </div>
                            <div className="text-sm text-gray-100">
                              {equip.description}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-yellow-300">
                            Lv.{currentLevel}
                          </div>
                          <div className="text-sm font-bold text-yellow-200">
                            💰 {cost}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {currentScreen === 'stats' && (
          <div className="gold-frame p-6">
            <h2 className="text-2xl font-black text-amber-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              통계
            </h2>
            
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-4 rounded-lg border-4 border-purple-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-purple-900">현재 레벨</span>
                  <span className="text-2xl font-black text-purple-700">{level}</span>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-blue-100 to-cyan-100 p-4 rounded-lg border-4 border-blue-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-900">직급</span>
                  <span className="text-xl font-black text-blue-700">{currentRank.name}</span>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-green-100 to-emerald-100 p-4 rounded-lg border-4 border-green-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-green-900">클릭 파워</span>
                  <span className="text-2xl font-black text-green-700">+{clickPower}</span>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-yellow-100 to-orange-100 p-4 rounded-lg border-4 border-yellow-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-orange-900">자동 수입</span>
                  <span className="text-2xl font-black text-orange-700">+{autoIncome}/초</span>
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-100 to-purple-100 p-4 rounded-lg border-4 border-indigo-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-indigo-900">총 클릭</span>
                  <span className="text-2xl font-black text-indigo-700">
                    {totalClicks.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="bg-gradient-to-r from-pink-100 to-rose-100 p-4 rounded-lg border-4 border-pink-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-pink-900">완료한 케이스</span>
                  <span className="text-2xl font-black text-pink-700">
                    {Object.values(casesCompleted).reduce((a, b) => a + b, 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 네비게이션 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-amber-900 to-amber-800 border-t-4 border-amber-950 p-2">
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-2">
          <button
            onClick={() => setCurrentScreen('game')}
            className={`nav-button rounded-lg p-3 ${currentScreen === 'game' ? 'active' : ''}`}
          >
            <Home className={`w-6 h-6 mx-auto mb-1 ${currentScreen === 'game' ? 'text-amber-900' : 'text-amber-100'}`} />
            <div className={`text-xs font-bold ${currentScreen === 'game' ? 'text-amber-900' : 'text-amber-100'}`}>
              홈
            </div>
          </button>

          <button
            onClick={() => setCurrentScreen('stats')}
            className={`nav-button rounded-lg p-3 ${currentScreen === 'stats' ? 'active' : ''}`}
          >
            <Award className={`w-6 h-6 mx-auto mb-1 ${currentScreen === 'stats' ? 'text-amber-900' : 'text-amber-100'}`} />
            <div className={`text-xs font-bold ${currentScreen === 'stats' ? 'text-amber-900' : 'text-amber-100'}`}>
              통계
            </div>
          </button>

          <button
            onClick={() => {
              if (confirm('정말 초기화하시겠습니까?')) {
                localStorage.removeItem(`gameData_${userId}`);
                window.location.reload();
              }
            }}
            className="nav-button rounded-lg p-3"
          >
            <TrendingUp className="w-6 h-6 mx-auto mb-1 text-amber-100" />
            <div className="text-xs font-bold text-amber-100">
              초기화
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
