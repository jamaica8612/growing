import { useCallback, useEffect, useState } from 'react';
import type {
  Student,
  Class,
  Attendance,
  Payment,
  CounselLog,
  KioskAlert,
  HomeworkAlert,
  HomeworkStatus,
  PaymentMethod,
  KakaoParentLink,
  KakaoParentRequest,
  KakaoParentRequestStatus,
  KakaoEventLog,
  KakaoChannelConfig,
  KakaoChannelConfigInput,
  HolidaySettings,
} from '../types';
import { api } from '../lib/api';
import { type MessageTemplates, DEFAULT_TEMPLATES } from '../lib/messageTemplates';
import { buildMonthlyBillingPreview } from '../lib/billingPreview';
import type { PayssamRow } from '../lib/payssam';

// Centralises all academy data: loads it from Supabase for the signed-in owner
// and exposes the same handler surface the UI used with localStorage, so the
// page components stay unchanged. Mutations write to the DB then reconcile the
// local copy from the returned row.
export function useAcademyData(userId: string) {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [counselLogs, setCounselLogs] = useState<CounselLog[]>([]);
  const [kioskAlerts, setKioskAlerts] = useState<KioskAlert[]>([]);
  const [homeworkAlerts, setHomeworkAlerts] = useState<HomeworkAlert[]>([]);
  const [kakaoParentLinks, setKakaoParentLinks] = useState<KakaoParentLink[]>([]);
  const [kakaoParentRequests, setKakaoParentRequests] = useState<KakaoParentRequest[]>([]);
  const [kakaoEventLogs, setKakaoEventLogs] = useState<KakaoEventLog[]>([]);
  const [kakaoChannels, setKakaoChannels] = useState<KakaoChannelConfig[]>([]);
  const [kioskPin, setKioskPin] = useState('1234');
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [holidaySettings, setHolidaySettings] = useState<HolidaySettings>({
    holidayAutoClose: true,
    calendarExceptions: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await api.loadAll();
      setStudents(snap.students);
      setClasses(snap.classes);
      setAttendance(snap.attendance);
      setPayments(snap.payments);
      setCounselLogs(snap.counselLogs);
      setKioskAlerts(snap.kioskAlerts);
      setHomeworkAlerts(snap.homeworkAlerts);
      setKakaoParentLinks(snap.kakaoParentLinks);
      setKakaoParentRequests(snap.kakaoParentRequests);
      setKakaoEventLogs(snap.kakaoEventLogs);
      setKakaoChannels(snap.kakaoChannels);
      setKioskPin(snap.kioskPin);
      setMessageTemplates(snap.messageTemplates);
      setHolidaySettings(snap.holidaySettings);
    } catch (e) {
      console.error('Failed to load academy data:', e);
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Canonical data-fetch on mount/owner-change; load() manages its own
    // loading/error state. (Not the cascading-render case the rule targets.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, userId]);

  // Wrap a mutation so any DB error surfaces to the user and resyncs state.
  const guard = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      console.error('Academy mutation failed:', e);
      alert(e instanceof Error ? `저장에 실패했습니다: ${e.message}` : '저장에 실패했습니다.');
      void load();
      return undefined;
    }
  };

  // ---- Students ----
  const handleAddStudent = (data: Omit<Student, 'id'>) =>
    guard(async () => {
      const st = await api.addStudent(data);
      setStudents(prev => [...prev, st]);
    });

  const handleUpdateStudent = (student: Student) =>
    guard(async () => {
      const st = await api.updateStudent(student);
      setStudents(prev => prev.map(p => (p.id === st.id ? st : p)));
    });

  const handleWithdrawStudent = (id: string) =>
    guard(async () => {
      const student = students.find(s => s.id === id);
      if (!student) return;
      const updatedStudent = await api.updateStudent({ ...student, status: 'inactive' });
      const affectedClasses = classes.filter(c => c.studentIds.includes(id));
      await Promise.all(
        affectedClasses.map(c => {
          const tuitionOverrides = { ...(c.tuitionOverrides ?? {}) };
          delete tuitionOverrides[id];
          return api.updateClass({ ...c, studentIds: c.studentIds.filter(sid => sid !== id), tuitionOverrides });
        })
      );
      setClasses(prev => prev.map(c => {
        const tuitionOverrides = { ...(c.tuitionOverrides ?? {}) };
        delete tuitionOverrides[id];
        return { ...c, studentIds: c.studentIds.filter(sid => sid !== id), tuitionOverrides };
      }));
      setStudents(prev => prev.map(p => (p.id === id ? updatedStudent : p)));
    });

  // 휴원: 반 배정 유지, 수강료 청구만 중단
  const handlePauseStudent = (id: string) =>
    guard(async () => {
      const student = students.find(s => s.id === id);
      if (!student) return;
      const updatedStudent = await api.updateStudent({ ...student, status: 'paused' });
      setStudents(prev => prev.map(p => (p.id === id ? updatedStudent : p)));
    });

  // 복귀: 휴원 → 재원
  const handleRestoreStudent = (id: string) =>
    guard(async () => {
      const student = students.find(s => s.id === id);
      if (!student) return;
      const updatedStudent = await api.updateStudent({ ...student, status: 'active' });
      setStudents(prev => prev.map(p => (p.id === id ? updatedStudent : p)));
    });

  // ---- Classes ----
  const handleAddClass = (data: Omit<Class, 'id'>) =>
    guard(async () => {
      const cls = await api.addClass(data);
      setClasses(prev => [...prev, cls]);
    });

  const handleUpdateClass = (cls: Class) =>
    guard(async () => {
      const updated = await api.updateClass(cls);
      setClasses(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    });

  const handleDeleteClass = (id: string) =>
    guard(async () => {
      await api.deleteClass(id); // cascades attendance for this class
      setClasses(prev => prev.filter(c => c.id !== id));
      setAttendance(prev => prev.filter(a => a.classId !== id));
    });

  // ---- Attendance ----
  const handleSaveAttendance = (data: Omit<Attendance, 'id' | 'memo'> & { memo?: string }) =>
    guard(async () => {
      const existing = attendance.find(
        a => a.studentId === data.studentId && a.classId === data.classId && a.date === data.date
      );
      // 보강(makeup)일 때만 "원래 결석일" 연결을 유지한다. 다른 상태로 바뀌면
      // 비워서, 이전 보강일이 DB에 stale 값으로 남거나 잘못 복원되지 않게 한다.
      if (existing) {
        const updated = await api.updateAttendance(existing.id, {
          status: data.status,
          memo: data.memo !== undefined ? data.memo : existing.memo,
          homeworkStatus: data.homeworkStatus !== undefined ? data.homeworkStatus : existing.homeworkStatus ?? '',
          // 부분 업데이트: 전달된 시각만 갱신하고 나머지는 기존 값 유지
          checkInTime: data.checkInTime !== undefined ? data.checkInTime : existing.checkInTime,
          checkOutTime: data.checkOutTime !== undefined ? data.checkOutTime : existing.checkOutTime,
          makeupForDate: data.status === 'makeup' ? (data.makeupForDate ?? existing.makeupForDate) : undefined,
          supplementMinutes: data.status === 'supplement' ? (data.supplementMinutes ?? existing.supplementMinutes) : undefined,
        });
        setAttendance(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      } else {
        const created = await api.insertAttendance({
          studentId: data.studentId,
          classId: data.classId,
          date: data.date,
          status: data.status,
          memo: data.memo ?? '',
          homeworkStatus: data.homeworkStatus ?? '',
          checkInTime: data.checkInTime,
          checkOutTime: data.checkOutTime,
          makeupForDate: data.status === 'makeup' ? data.makeupForDate : undefined,
          supplementMinutes: data.status === 'supplement' ? data.supplementMinutes : undefined,
        });
        setAttendance(prev => [...prev, created]);
      }
    });

  const handleDeleteAttendance = (attendanceId: string) =>
    guard(async () => {
      await api.deleteAttendance(attendanceId);
      setAttendance(prev => prev.filter(a => a.id !== attendanceId));
    });

  // ---- Payments ----
  // 미리보기와 동일한 로직(buildMonthlyBillingPreview)으로 청구를 생성한다.
  // 결과(생성/건너뜀 건수)를 반환해 화면에서 피드백을 보여줄 수 있게 한다.
  // 알림(alert)은 호출하는 컴포넌트가 담당한다.
  const handleGenerateMonthlyBills = (month: string) =>
    guard(async () => {
      const preview = buildMonthlyBillingPreview(students, classes, payments, month);
      const skipped = preview.alreadyBilled.length;
      if (preview.toCreate.length === 0) {
        return { created: 0, skipped };
      }
      const newBills: Omit<Payment, 'id'>[] = preview.toCreate.map(row => ({
        studentId: row.studentId,
        billingMonth: month,
        amount: row.amount,
        status: 'unpaid',
      }));
      const created = await api.insertPayments(newBills);
      setPayments(prev => [...prev, ...created]);
      return { created: created.length, skipped };
    });

  const handleRecordPayment = (paymentId: string, paymentDate: string, method: PaymentMethod) =>
    guard(async () => {
      const updated = await api.updatePayment(paymentId, { status: 'paid', paymentDate, paymentMethod: method });
      setPayments(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    });

  const handleCancelPayment = (paymentId: string) =>
    guard(async () => {
      const updated = await api.updatePayment(paymentId, {
        status: 'unpaid',
        paymentDate: undefined,
        paymentMethod: undefined,
      });
      setPayments(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    });

  const handleDeletePayment = (paymentId: string) =>
    guard(async () => {
      await api.deletePayment(paymentId);
      setPayments(prev => prev.filter(p => p.id !== paymentId));
    });

  const handleAddManualPayment = (data: Omit<Payment, 'id'>) =>
    guard(async () => {
      const created = await api.insertPayment(data);
      setPayments(prev => [...prev, created]);
    });

  // 결제선생 발송수납내역 가져오기.
  // 매칭된 학생만 처리: 이미 해당 월 청구서 있으면 납부상태 업데이트, 없으면 신규 생성.
  // 같은 학생+월 중복 행은 첫 번째만 처리(건너뜀 집계).
  const handleImportPayssam = (matchedRows: (PayssamRow & { studentId: string })[]) =>
    guard(async () => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const seen = new Set<string>(); // studentId:month 중복 방지

      for (const row of matchedRows) {
        const key = `${row.studentId}:${row.month}`;
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);

        const existing = payments.find(
          p => p.studentId === row.studentId && p.billingMonth === row.month,
        );

        if (existing) {
          if (row.isPaid && existing.status !== 'paid') {
            const up = await api.updatePayment(existing.id, {
              status: 'paid',
              paymentDate: row.paymentDate || new Date().toISOString().split('T')[0],
              paymentMethod: row.paymentMethod || 'card',
            });
            setPayments(prev => prev.map(p => (p.id === up.id ? up : p)));
            updated++;
          } else {
            skipped++;
          }
        } else {
          const newP = await api.insertPayment({
            studentId: row.studentId,
            billingMonth: row.month,
            amount: row.amount,
            status: row.isPaid ? 'paid' : 'unpaid',
            paymentDate: row.isPaid ? row.paymentDate || undefined : undefined,
            paymentMethod: row.isPaid ? row.paymentMethod || undefined : undefined,
          });
          setPayments(prev => [...prev, newP]);
          created++;
        }
      }

      return { created, updated, skipped };
    });

  // ---- Counsel logs ----
  const handleAddCounselLog = (data: Omit<CounselLog, 'id'>) =>
    guard(async () => {
      const created = await api.addCounselLog(data);
      setCounselLogs(prev => [...prev, created]);
    });

  const handleUpdateCounselLog = (log: CounselLog) =>
    guard(async () => {
      const updated = await api.updateCounselLog(log);
      setCounselLogs(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    });

  const handleDeleteCounselLog = (id: string) =>
    guard(async () => {
      await api.deleteCounselLog(id);
      setCounselLogs(prev => prev.filter(l => l.id !== id));
    });

  // ---- Kiosk alerts ----
  const handleQueueKioskAlert = (studentId: string, kind: 'in' | 'out', date: string, time: string) =>
    guard(async () => {
      const created = await api.addKioskAlert(studentId, kind, date, time);
      setKioskAlerts(prev => [...prev, created]);
    });

  const handleDismissKioskAlert = (id: string) =>
    guard(async () => {
      await api.deleteKioskAlert(id);
      setKioskAlerts(prev => prev.filter(a => a.id !== id));
    });

  const handleClearKioskAlerts = () =>
    guard(async () => {
      await api.clearKioskAlerts(kioskAlerts.map(a => a.id));
      setKioskAlerts([]);
    });

  // ---- Homework alerts ----
  const handleQueueHomeworkAlert = (studentId: string, date: string, homeworkStatus: Exclude<HomeworkStatus, ''>) =>
    guard(async () => {
      const created = await api.addHomeworkAlert(studentId, date, homeworkStatus);
      setHomeworkAlerts(prev => [...prev, created]);
    });

  const handleDismissHomeworkAlert = (id: string) =>
    guard(async () => {
      await api.deleteHomeworkAlert(id);
      setHomeworkAlerts(prev => prev.filter(a => a.id !== id));
    });

  const handleClearHomeworkAlerts = () =>
    guard(async () => {
      await api.clearHomeworkAlerts(homeworkAlerts.map(a => a.id));
      setHomeworkAlerts([]);
    });

  const handleKakaoRequestStatus = (id: string, status: KakaoParentRequestStatus) =>
    guard(async () => {
      const updated = await api.updateKakaoParentRequestStatus(id, status);
      setKakaoParentRequests(prev => prev.map(req => (req.id === updated.id ? updated : req)));
    });

  const handleDeleteKakaoRequest = (id: string) =>
    guard(async () => {
      await api.deleteKakaoParentRequest(id);
      setKakaoParentRequests(prev => prev.filter(req => req.id !== id));
    });

  const handleDeleteKakaoParentLink = (id: string) =>
    guard(async () => {
      await api.deleteKakaoParentLink(id);
      await load();
    });

  const handleDeleteKakaoUnlinkedIdentity = (requestId: string) =>
    guard(async () => {
      await api.deleteKakaoUnlinkedIdentity(requestId);
      await load();
    });

  const handleSaveKakaoChannel = (config: KakaoChannelConfigInput) =>
    guard(async () => {
      const saved = await api.saveKakaoChannelConfig(userId, config);
      setKakaoChannels(prev => {
        const exists = prev.some(channel => channel.id === saved.id);
        return exists ? prev.map(channel => (channel.id === saved.id ? saved : channel)) : [saved, ...prev];
      });
    });

  // ---- Settings ----
  const handleChangeKioskPin = (newPin: string) =>
    guard(async () => {
      await api.setKioskPin(userId, newPin);
      setKioskPin(newPin);
    });

  const handleSaveMessageTemplates = (templates: MessageTemplates) =>
    guard(async () => {
      await api.setMessageTemplates(userId, templates);
      setMessageTemplates(templates);
    });

  const handleSaveHolidaySettings = async (settings: HolidaySettings): Promise<boolean> => {
    try {
      const saved = await api.setHolidaySettings(userId, settings);
      setHolidaySettings(saved);
      return true;
    } catch (e) {
      // Keep the local editor draft intact on failure. Unlike the shared guard,
      // this save reports its result to the editor instead of reloading all data.
      console.error('Failed to save holiday settings:', e);
      return false;
    }
  };

  // ---- Backup: export current data / restore a JSON backup into the DB ----
  const getAllData = () => ({ students, classes, attendance, payments, counselLogs, holidaySettings });

  const handleImportData = async (data: {
    students: Student[];
    classes: Class[];
    attendance: Attendance[];
    payments: Payment[];
    counselLogs: CounselLog[];
    holidaySettings?: HolidaySettings;
  }): Promise<boolean> => {
    let succeeded = false;
    await guard(async () => {
      await api.clearAll();
      // Old backups carry client-generated ids; remap them to fresh DB uuids.
      const studentIdMap = new Map<string, string>();
      for (const st of data.students) {
        const created = await api.addStudent(st);
        studentIdMap.set(st.id, created.id);
      }
      const classIdMap = new Map<string, string>();
      for (const c of data.classes) {
        const studentIds = c.studentIds.map(id => studentIdMap.get(id)).filter((v): v is string => Boolean(v));
        const tuitionOverrides = Object.fromEntries(
          Object.entries(c.tuitionOverrides ?? {})
            .map(([oldId, fee]) => [studentIdMap.get(oldId), fee] as const)
            .filter((entry): entry is [string, number] => Boolean(entry[0]) && Number.isFinite(entry[1]))
        );
        const created = await api.addClass({
          ...c,
          tuitionOverrides,
          studentIds,
        });
        classIdMap.set(c.id, created.id);
      }
      for (const a of data.attendance) {
        const studentId = studentIdMap.get(a.studentId);
        if (!studentId) continue;
        await api.insertAttendance({
          studentId,
          classId: classIdMap.get(a.classId) ?? '',
          date: a.date,
          // 과거 백업의 지각(late)은 제거된 상태이므로 출석으로 정규화해 복원한다
          // (DB 체크 제약이 late를 더 이상 허용하지 않음).
          status: a.status === 'late' ? 'present' : a.status,
          memo: a.memo ?? '',
          homeworkStatus: a.homeworkStatus ?? '',
          checkInTime: a.checkInTime,
          checkOutTime: a.checkOutTime,
          makeupForDate: a.makeupForDate,
          supplementMinutes: a.supplementMinutes,
        });
      }
      for (const p of data.payments) {
        const studentId = studentIdMap.get(p.studentId);
        if (!studentId) continue;
        await api.insertPayment({ ...p, studentId });
      }
      for (const l of data.counselLogs) {
        const studentId = studentIdMap.get(l.studentId);
        if (!studentId) continue;
        await api.addCounselLog({ ...l, studentId });
      }
      if (data.holidaySettings) {
        const savedHolidaySettings = await api.setHolidaySettings(userId, data.holidaySettings);
        setHolidaySettings(savedHolidaySettings);
      }
      await load();
      succeeded = true;
    });
    return succeeded;
  };

  // "Reset" in DB mode wipes all of this owner's academy data.
  const handleResetData = () =>
    guard(async () => {
      await api.clearAll();
      setStudents([]);
      setClasses([]);
      setAttendance([]);
      setPayments([]);
      setCounselLogs([]);
      setKioskAlerts([]);
      setHomeworkAlerts([]);
    });

  return {
    loading,
    error,
    reload: load,
    students,
    classes,
    attendance,
    payments,
    counselLogs,
    kioskAlerts,
    homeworkAlerts,
    kakaoParentLinks,
    kakaoParentRequests,
    kakaoEventLogs,
    kakaoChannels,
    kioskPin,
    messageTemplates,
    holidaySettings,
    handleAddStudent,
    handleUpdateStudent,
    handleWithdrawStudent,
    handlePauseStudent,
    handleRestoreStudent,
    handleAddClass,
    handleUpdateClass,
    handleDeleteClass,
    handleSaveAttendance,
    handleDeleteAttendance,
    handleGenerateMonthlyBills,
    handleRecordPayment,
    handleCancelPayment,
    handleDeletePayment,
    handleAddManualPayment,
    handleImportPayssam,
    handleAddCounselLog,
    handleUpdateCounselLog,
    handleDeleteCounselLog,
    handleQueueKioskAlert,
    handleDismissKioskAlert,
    handleClearKioskAlerts,
    handleQueueHomeworkAlert,
    handleDismissHomeworkAlert,
    handleClearHomeworkAlerts,
    handleKakaoRequestStatus,
    handleDeleteKakaoRequest,
    handleDeleteKakaoParentLink,
    handleDeleteKakaoUnlinkedIdentity,
    handleSaveKakaoChannel,
    handleChangeKioskPin,
    handleSaveMessageTemplates,
    handleSaveHolidaySettings,
    getAllData,
    handleImportData,
    handleResetData,
  };
}
