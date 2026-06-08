// 그로잉영어 — 학생 태그 & 타임라인 로직 포팅 (window.GStudents)
(function () {
  const toDate = (v) => new Date(`${v}T00:00:00`);
  const daysBetween = (from, to) => Math.floor((to.getTime() - toDate(from).getTime()) / 86400000);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const norm = (s) => (s === 'late' ? 'present' : s);
  const isReportLog = (log, month) => log.type === 'progress' && log.title.includes(month) && log.title.includes('월간 학습 리포트');

  function getStudentTags({ student, classes, attendance, payments, counselLogs, today }) {
    if (student.status !== 'active') return [];
    const tags = [];
    const sClasses = classes.filter(c => c.studentIds.includes(student.id));
    const sAtt = attendance.filter(a => a.studentId === student.id);
    const sLogs = counselLogs.filter(l => l.studentId === student.id);
    const cm = monthKey(today);

    if (payments.some(p => p.studentId === student.id && p.billingMonth === cm && p.status === 'unpaid'))
      tags.push({ key: 'unpaid', label: '미납', severity: 'danger', reason: `${cm} 청구 중 미납 건이 있습니다.` });
    if (!(student.parentContact || '').trim())
      tags.push({ key: 'missing-parent-contact', label: '연락처 없음', severity: 'warning', reason: '학부모 연락처가 비어 있습니다.' });
    if (sClasses.length === 0)
      tags.push({ key: 'no-class', label: '반 미배정', severity: 'warning', reason: '현재 배정된 반이 없습니다.' });
    const recentAbs = sAtt.filter(a => a.status === 'absent' && daysBetween(a.date, today) <= 14);
    if (recentAbs.length >= 2)
      tags.push({ key: 'frequent-absence', label: '결석 잦음', severity: 'danger', reason: `최근 14일 결석이 ${recentAbs.length}회입니다.` });
    const hwFollow = sAtt.filter(a => daysBetween(a.date, today) <= 30 && (a.homeworkStatus === 'incomplete' || a.homeworkStatus === 'undone'));
    if (hwFollow.length >= 2)
      tags.push({ key: 'homework-followup', label: '숙제 미흡', severity: 'warning', reason: `최근 30일 숙제 미완료/미흡이 ${hwFollow.length}회입니다.` });
    if (!sLogs.some(l => l.type === 'counsel' && daysBetween(l.date, today) <= 60))
      tags.push({ key: 'needs-counsel', label: '상담 필요', severity: 'info', reason: '최근 60일 상담 기록이 없습니다.' });
    if (!sLogs.some(l => isReportLog(l, cm)))
      tags.push({ key: 'report-missing', label: '리포트 미작성', severity: 'info', reason: `${cm} 월간 학습 리포트가 아직 저장되지 않았습니다.` });
    return tags;
  }

  const attLabel = { present: '출석', absent: '결석', makeup: '보강' };
  const hwLabel = { done: '완료', incomplete: '미흡', undone: '미완료' };
  const payLabel = { paid: '납부 완료', unpaid: '미납' };

  function getStudentTimeline({ student, classes, attendance, payments, counselLogs }) {
    const names = new Map(classes.map(c => [c.id, c.name]));
    const att = attendance.filter(r => r.studentId === student.id).map(r => {
      const st = norm(r.status);
      const times = [r.checkInTime ? `등원 ${r.checkInTime}` : '', r.checkOutTime ? `하원 ${r.checkOutTime}` : ''].filter(Boolean).join(' / ');
      return { id: `att-${r.id}`, type: 'attendance', date: r.date, title: attLabel[st],
        detail: [names.get(r.classId) || '반 정보 없음', r.makeupForDate ? `${r.makeupForDate} 결석분 보강` : '', r.memo || ''].filter(Boolean).join(' · '),
        meta: times, severity: st === 'absent' ? 'danger' : st === 'makeup' ? 'info' : 'success' };
    });
    const hw = attendance.filter(r => r.studentId === student.id && r.homeworkStatus).map(r => ({
      id: `hw-${r.id}`, type: 'homework', date: r.date, title: `숙제 ${hwLabel[r.homeworkStatus]}`,
      detail: names.get(r.classId) || '반 정보 없음', severity: r.homeworkStatus === 'done' ? 'success' : 'warning' }));
    const pay = payments.filter(p => p.studentId === student.id).map(p => ({
      id: `pay-${p.id}`, type: 'payment', date: p.paymentDate || `${p.billingMonth}-01`,
      title: `${p.billingMonth} ${payLabel[p.status]}`, detail: `${p.amount.toLocaleString()}원`,
      meta: p.method ? `결제수단 ${({ card: '카드', cash: '현금', transfer: '계좌이체' })[p.method] || p.method}` : undefined,
      severity: p.status === 'paid' ? 'success' : 'danger' }));
    const cou = counselLogs.filter(l => l.studentId === student.id).map(l => {
      const isRep = l.type === 'progress' && l.title.includes('월간 학습 리포트');
      return { id: `log-${l.id}`, type: isRep ? 'report' : (l.type === 'test' ? 'test' : l.type === 'progress' ? 'progress' : 'counsel'),
        date: l.date, title: l.title, detail: l.content,
        meta: l.type === 'test' && l.score ? `점수 ${l.score}` : undefined,
        severity: l.type === 'test' ? 'info' : 'success' };
    });
    return [...att, ...hw, ...pay, ...cou].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  function attendanceRate(student, attendance) {
    const recs = attendance.filter(a => a.studentId === student.id);
    if (recs.length === 0) return 0;
    const attended = recs.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'makeup').length;
    return Math.round((attended / recs.length) * 100);
  }

  window.GStudents = { getStudentTags, getStudentTimeline, attendanceRate, monthKey };
})();
