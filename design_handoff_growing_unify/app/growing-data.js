// 그로잉영어 — 대시보드 프로토타입용 목업 데이터 (실제 앱 스키마를 모사)
// window.GROWING_DATA 로 노출. 날짜는 '오늘'(2026-06-01, 월요일) 기준.

(function () {
  const TODAY = '2026-06-01'; // 월요일

  // 재원생 (status: active / paused / withdrawn)
  const students = [
    { id: 's1',  name: '김서윤', school: '그로잉초', grade: '초 4', parentContact: '010-2841-7790', status: 'active' },
    { id: 's2',  name: '이준호', school: '그로잉초', grade: '초 4', parentContact: '010-3320-1187', status: 'active' },
    { id: 's3',  name: '박지민', school: '한들초',  grade: '초 5', parentContact: '010-9921-4456', status: 'active' },
    { id: 's4',  name: '최예린', school: '한들초',  grade: '초 5', parentContact: '010-4417-8830', status: 'active' },
    { id: 's5',  name: '정시우', school: '그로잉초', grade: '초 5', parentContact: '010-7755-2093', status: 'active' },
    { id: 's6',  name: '강하은', school: '솔빛중',  grade: '중 1', parentContact: '010-2266-9981', status: 'active' },
    { id: 's7',  name: '윤도현', school: '솔빛중',  grade: '중 1', parentContact: '',             status: 'active' },
    { id: 's8',  name: '임채원', school: '솔빛중',  grade: '중 2', parentContact: '010-8814-3320', status: 'active' },
    { id: 's9',  name: '한지후', school: '대청중',  grade: '중 2', parentContact: '010-5590-7741', status: 'active' },
    { id: 's10', name: '오서연', school: '대청중',  grade: '중 2', parentContact: '010-3308-6612', status: 'active' },
    { id: 's11', name: '신민준', school: '한들초',  grade: '초 6', parentContact: '010-9043-2218', status: 'active' },
    { id: 's12', name: '배수아', school: '한들초',  grade: '초 6', parentContact: '010-6671-5540', status: 'active' },
    { id: 's13', name: '문지안', school: '솔빛중',  grade: '중 1', parentContact: '010-2299-7783', status: 'paused' },
    { id: 's14', name: '권태양', school: '그로잉초', grade: '초 4', parentContact: '010-7012-9934', status: 'active' },
  ];

  // 반/시간표 — 월요일(오늘) 수업 3개 반
  const classes = [
    {
      id: 'c1', name: 'Phonics A', color: '#10b981', tuitionFee: 180000,
      schedules: [{ day: '월', startTime: '15:00', endTime: '16:20' }, { day: '수', startTime: '15:00', endTime: '16:20' }],
      studentIds: ['s1', 's2', 's14'], capacity: 6, waitlist: [],
    },
    {
      id: 'c2', name: 'Reading 초등', color: '#3b82f6', tuitionFee: 200000,
      schedules: [{ day: '월', startTime: '16:30', endTime: '18:00' }, { day: '목', startTime: '16:30', endTime: '18:00' }],
      studentIds: ['s3', 's4', 's5', 's11', 's12'], capacity: 5, waitlist: ['이서준 (초5)', '김하랑 (초5)'],
    },
    {
      id: 'c3', name: 'Grammar 중등', color: '#8b5cf6', tuitionFee: 220000,
      schedules: [{ day: '월', startTime: '18:30', endTime: '20:00' }, { day: '금', startTime: '18:30', endTime: '20:00' }],
      studentIds: ['s6', 's7', 's8', 's9', 's10', 's13'], capacity: 8, waitlist: [],
    },
    {
      id: 'c4', name: 'Speaking Club', color: '#f59e0b', tuitionFee: 150000,
      schedules: [{ day: '화', startTime: '17:00', endTime: '18:00' }],
      studentIds: ['s6', 's8', 's10'], capacity: 8, waitlist: ['박서진 (중1)'],
    },
  ];

  // 오늘(월) 출결 — 1교시 Phonics A는 모두 체크 완료, 2교시 Reading 일부만, 3교시 Grammar 미체크
  // status: present / absent / late / makeup
  const attendance = [
    // Phonics A (완료)
    { id: 'a1', studentId: 's1', classId: 'c1', date: TODAY, status: 'present', checkInTime: '14:56', checkOutTime: '16:22', homeworkStatus: 'done' },
    { id: 'a2', studentId: 's2', classId: 'c1', date: TODAY, status: 'present', checkInTime: '15:03', checkOutTime: '16:21', homeworkStatus: 'incomplete' },
    { id: 'a3', studentId: 's14', classId: 'c1', date: TODAY, status: 'late', checkInTime: '15:18', checkOutTime: '16:22', homeworkStatus: 'done', memo: '버스 놓쳐 18분 지각' },
    // Reading 초등 (일부)
    { id: 'a4', studentId: 's3', classId: 'c2', date: TODAY, status: 'present', checkInTime: '16:25', checkOutTime: '', homeworkStatus: 'done' },
    { id: 'a5', studentId: 's4', classId: 'c2', date: TODAY, status: 'makeup', checkInTime: '16:31', checkOutTime: '', homeworkStatus: '', makeupForDate: '2026-05-28' },
    // s5, s11, s12 미체크 / Grammar 전원 미체크

    // ─ 박지민(s3) 5월 이력 (타임라인 데모용) ─
    { id: 'h1', studentId: 's3', classId: 'c2', date: '2026-05-07', status: 'present', checkInTime: '16:24', checkOutTime: '18:02', homeworkStatus: 'done' },
    { id: 'h2', studentId: 's3', classId: 'c2', date: '2026-05-09', status: 'absent', memo: '감기로 결석 (학부모 연락)' },
    { id: 'h3', studentId: 's3', classId: 'c2', date: '2026-05-12', status: 'makeup', checkInTime: '15:02', checkOutTime: '16:30', homeworkStatus: 'done', makeupForDate: '2026-05-09' },
    { id: 'h4', studentId: 's3', classId: 'c2', date: '2026-05-14', status: 'present', checkInTime: '16:28', checkOutTime: '18:01', homeworkStatus: 'incomplete' },
    { id: 'h5', studentId: 's3', classId: 'c2', date: '2026-05-21', status: 'present', checkInTime: '16:26', checkOutTime: '18:00', homeworkStatus: 'done' },
    { id: 'h6', studentId: 's3', classId: 'c2', date: '2026-05-28', status: 'present', checkInTime: '16:25', checkOutTime: '18:03', homeworkStatus: 'done' },
  ];

  // 상담/진도/평가 일지
  const counselLogs = [
    { id: 'l1', studentId: 's3', date: '2026-05-15', type: 'counsel', title: '전화상담 — 리딩 레벨 조정', content: '어머니와 통화. 현재 레벨이 다소 쉽다는 의견으로 다음 달부터 한 단계 상향 검토. 가정에서 데일리 리딩 10분 권장.' },
    { id: 'l2', studentId: 's3', date: '2026-05-22', type: 'test', title: '단어 시험 (Unit 5)', content: 'Unit 5 단어 50개 평가. 철자 정확도 우수, 뜻 매칭에서 4개 오답.', score: '92/100' },
    { id: 'l3', studentId: 's3', date: '2026-05-23', type: 'progress', title: '5월 4주차 진도', content: 'Reading Book 2 Unit 5 완료. 본문 독해 속도 향상. 6월부터 Unit 6 시작 예정.' },
    { id: 'l4', studentId: 's9', date: '2026-05-18', type: 'counsel', title: '대면상담 — 결석 잦음 관련', content: '최근 결석이 잦아 학부모 상담 진행. 학원 차량 시간 조정으로 등원 부담 완화하기로 함.' },
    { id: 'l5', studentId: 's1', date: '2026-05-20', type: 'test', title: 'Phonics 진단평가', content: '파닉스 단모음/장모음 구분 평가.', score: 'Pass' },
  ];

  // 지난 2주 결석 데이터(브리핑 "결석 잦은 학생"용)
  const pastAbsences = [
    { studentId: 's9', count: 3 },
    { studentId: 's11', count: 2 },
  ];

  // 6월 수납 — 일부 미납
  const billingMonth = '2026-06';
  const payments = [
    { id: 'p1', studentId: 's1',  billingMonth, status: 'paid',   amount: 180000, paymentDate: '2026-06-01', method: 'card' },
    { id: 'p2', studentId: 's2',  billingMonth, status: 'paid',   amount: 180000, paymentDate: '2026-05-31', method: 'transfer' },
    { id: 'p3', studentId: 's3',  billingMonth, status: 'unpaid', amount: 200000 },
    { id: 'p5', studentId: 's8',  billingMonth, status: 'unpaid', amount: 220000 },
    { id: 'p6', studentId: 's9',  billingMonth, status: 'unpaid', amount: 220000 },
    { id: 'p7', studentId: 's11', billingMonth, status: 'unpaid', amount: 200000 },
    { id: 'p8', studentId: 's12', billingMonth, status: 'paid',   amount: 200000, paymentDate: '2026-05-30', method: 'cash' },
    { id: 'p9', studentId: 's5',  billingMonth, status: 'paid',   amount: 200000, paymentDate: '2026-06-01', method: 'card' },
    { id: 'p10', studentId: 's6', billingMonth, status: 'paid',   amount: 220000, paymentDate: '2026-05-29', method: 'transfer' },
    { id: 'p11', studentId: 's10', billingMonth, status: 'paid',  amount: 220000, paymentDate: '2026-06-01', method: 'card' },
    { id: 'p12', studentId: 's14', billingMonth, status: 'paid',  amount: 180000, paymentDate: '2026-05-31', method: 'card' },
    { id: 'p4', studentId: 's4',  billingMonth, status: 'paid',   amount: 200000, paymentDate: '2026-06-01', method: 'card' },
    // 박지민(s3) 5월 완납 — 타임라인 데모
    { id: 'p3b', studentId: 's3', billingMonth: '2026-05', status: 'paid', amount: 200000, paymentDate: '2026-05-03', method: 'transfer' },
  ];

  // 최근 5개월 매출(수납 완료액) 추이
  const revenueHistory = [
    { label: '2월', value: 2120000 },
    { label: '3월', value: 2280000 },
    { label: '4월', value: 2200000 },
    { label: '5월', value: 2460000 },
    { label: '6월', value: 1800000 },
  ];

  // 알림장 발송 대기 큐 (키오스크 등하원 + 수제 알림)
  const now = Date.now();
  const kioskAlerts = [
    { id: 'k1', studentId: 's1',  kind: 'in',  date: TODAY, time: '14:56', createdAt: now - 360000 },
    { id: 'k2', studentId: 's2',  kind: 'in',  date: TODAY, time: '15:03', createdAt: now - 300000 },
    { id: 'k3', studentId: 's7',  kind: 'in',  date: TODAY, time: '15:10', createdAt: now - 220000 },
    { id: 'k4', studentId: 's14', kind: 'out', date: TODAY, time: '16:22', createdAt: now - 60000 },
  ];
  const homeworkAlerts = [
    { id: 'hw1', studentId: 's2', homeworkStatus: 'incomplete', date: TODAY, createdAt: now - 180000 },
    { id: 'hw2', studentId: 's14', homeworkStatus: 'done', date: TODAY, createdAt: now - 120000 },
  ];

  // ─ 4~5월 출결 시뮬레이션 (통계 화면용, 결정적 의사난수) ─
  (function () {
    const seed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
    const dows = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    const activeSet = new Set(students.filter(s => s.status === 'active').map(s => s.id));
    let gid = 1000;
    ['2026-04', '2026-05'].forEach(ym => {
      const [y, m] = ym.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const date = `${ym}-${String(d).padStart(2, '0')}`;
        const dow = new Date(`${date}T00:00:00`).getDay();
        classes.forEach(cls => {
          if (!cls.schedules.some(s => dows[s.day] === dow)) return;
          cls.studentIds.forEach(sid => {
            if (!activeSet.has(sid)) return;
            if (attendance.some(a => a.studentId === sid && a.classId === cls.id && a.date === date)) return;
            const r = seed(`${sid}-${date}`);
            const status = r < 0.09 ? 'absent' : r < 0.13 ? 'makeup' : 'present';
            const hwR = seed(`hw-${sid}-${date}`);
            const hw = status === 'absent' ? '' : (hwR < 0.72 ? 'done' : hwR < 0.89 ? 'incomplete' : 'undone');
            attendance.push({ id: `g${gid++}`, studentId: sid, classId: cls.id, date, status,
              checkInTime: status === 'absent' ? undefined : '15:30', checkOutTime: status === 'absent' ? undefined : '17:00', homeworkStatus: hw });
          });
        });
      }
    });
  })();

  window.GROWING_DATA = { TODAY, students, classes, attendance, counselLogs, kioskAlerts, homeworkAlerts, pastAbsences, billingMonth, payments, revenueHistory };
})();
