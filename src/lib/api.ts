import { supabase } from './supabase';
import type {
  Student,
  Class,
  ClassSchedule,
  Attendance,
  Payment,
  CounselLog,
  KioskAlert,
  HomeworkAlert,
  KakaoParentLink,
  KakaoParentRequest,
  KakaoParentRequestStatus,
  KakaoEventLog,
  KakaoChannelConfig,
  StudentStatus,
  AttendanceStatus,
  HomeworkStatus,
  PaymentMethod,
  PaymentStatus,
  CounselLogType,
  MessageLog,
} from '../types';
import { type MessageTemplates, mergeTemplates } from './messageTemplates';
import { deriveLegacyClassScheduleFields } from './classSchedules';

type Row = Record<string, unknown>;

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const orNull = (v: string | undefined | null) => (v && v.length > 0 ? v : null);
// Attendance/kiosk class id is a uuid or null; the app sometimes passes '' / a
// non-uuid placeholder when a student has no class.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const classIdParam = (id: string | undefined) => (id && UUID_RE.test(id) ? id : null);

const toSchedules = (r: Row): ClassSchedule[] => {
  const schedules = Array.isArray(r.schedules) ? r.schedules : [];
  if (schedules.length > 0) {
    return schedules
      .map(item => item as Record<string, unknown>)
      .filter(item => typeof item.day === 'string' && typeof item.startTime === 'string' && typeof item.endTime === 'string')
      .map(item => ({
        day: item.day as ClassSchedule['day'],
        startTime: item.startTime as string,
        endTime: item.endTime as string,
      }));
  }
  const days = (r.days as Class['days']) ?? [];
  const startTime = s(r.start_time);
  const endTime = s(r.end_time);
  return days.map(day => ({ day, startTime, endTime }));
};

const toTuitionOverrides = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, fee]) => typeof fee === 'number' && Number.isFinite(fee) && fee >= 0)
  ) as Record<string, number>;
};

// ---- DB row -> app type mappers ----
const toStudent = (r: Row): Student => ({
  id: r.id as string,
  name: s(r.name),
  school: s(r.school),
  grade: s(r.grade),
  contact: s(r.contact),
  parentContact: s(r.parent_contact),
  registrationDate: s(r.registration_date),
  status: r.status as StudentStatus,
  memo: s(r.memo),
});

const toClass = (r: Row): Class => ({
  id: r.id as string,
  name: s(r.name),
  days: (r.days as Class['days']) ?? [],
  startTime: s(r.start_time),
  endTime: s(r.end_time),
  schedules: toSchedules(r),
  tuitionFee: (r.tuition_fee as number) ?? 0,
  tuitionOverrides: toTuitionOverrides(r.tuition_overrides),
  studentIds: (r.student_ids as string[]) ?? [],
  color: (r.color as string) ?? undefined,
});

const toAttendance = (r: Row): Attendance => ({
  id: r.id as string,
  studentId: r.student_id as string,
  classId: (r.class_id as string) ?? '',
  date: r.date as string,
  status: r.status as AttendanceStatus,
  memo: s(r.memo),
  homeworkStatus: (s(r.homework_status) || '') as HomeworkStatus,
  checkInTime: (r.check_in_time as string) ?? undefined,
  checkOutTime: (r.check_out_time as string) ?? undefined,
  makeupForDate: (r.makeup_for_date as string) ?? undefined,
  supplementMinutes: (r.supplement_minutes as number) ?? undefined,
});

const toPayment = (r: Row): Payment => ({
  id: r.id as string,
  studentId: r.student_id as string,
  billingMonth: r.billing_month as string,
  amount: (r.amount as number) ?? 0,
  paymentDate: (r.payment_date as string) ?? undefined,
  paymentMethod: ((r.payment_method as string) ?? undefined) as PaymentMethod | undefined,
  status: r.status as PaymentStatus,
});

const toCounselLog = (r: Row): CounselLog => ({
  id: r.id as string,
  studentId: r.student_id as string,
  date: r.date as string,
  title: s(r.title),
  content: s(r.content),
  type: r.type as CounselLogType,
  score: (r.score as string) ?? undefined,
});

const toKioskAlert = (r: Row): KioskAlert => ({
  id: r.id as string,
  studentId: r.student_id as string,
  kind: r.kind as 'in' | 'out',
  date: r.date as string,
  time: r.time as string,
  createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
});

const toHomeworkAlert = (r: Row): HomeworkAlert => ({
  id: r.id as string,
  studentId: r.student_id as string,
  date: r.date as string,
  homeworkStatus: r.homework_status as Exclude<HomeworkStatus, ''>,
  createdAt: r.created_at ? new Date(r.created_at as string).getTime() : Date.now(),
});

const toKakaoParentLink = (r: Row): KakaoParentLink => ({
  id: r.id as string,
  studentId: r.student_id as string,
  kakaoUserKey: s(r.kakao_user_key),
  plusfriendUserKey: s(r.plusfriend_user_key),
  parentPhone: s(r.parent_phone),
  verifiedAt: s(r.verified_at),
  consentAt: (r.consent_at as string) ?? undefined,
  blockedAt: (r.blocked_at as string) ?? undefined,
});

const toKakaoParentRequest = (r: Row): KakaoParentRequest => ({
  id: r.id as string,
  studentId: (r.student_id as string) ?? undefined,
  kakaoUserKey: s(r.kakao_user_key),
  requestType: r.request_type as KakaoParentRequest['requestType'],
  message: s(r.message),
  status: r.status as KakaoParentRequestStatus,
  createdAt: s(r.created_at),
  resolvedAt: (r.resolved_at as string) ?? undefined,
});

const toKakaoEventLog = (r: Row): KakaoEventLog => ({
  id: r.id as string,
  kakaoUserKey: s(r.kakao_user_key),
  plusfriendUserKey: (r.plusfriend_user_key as string) ?? undefined,
  eventType: s(r.event_type),
  intent: (r.intent as string) ?? undefined,
  status: s(r.status),
  createdAt: s(r.created_at),
});

const toKakaoChannelConfig = (r: Row): KakaoChannelConfig => ({
  id: r.id as string,
  channelName: s(r.channel_name),
  skillSecret: s(r.skill_secret),
  eventSecret: (r.event_secret as string) ?? undefined,
  enabled: Boolean(r.enabled),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at),
});

export interface AcademySnapshot {
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  payments: Payment[];
  counselLogs: CounselLog[];
  kioskAlerts: KioskAlert[];
  homeworkAlerts: HomeworkAlert[];
  kakaoParentLinks: KakaoParentLink[];
  kakaoParentRequests: KakaoParentRequest[];
  kakaoEventLogs: KakaoEventLog[];
  kakaoChannels: KakaoChannelConfig[];
  kioskPin: string;
  messageTemplates: MessageTemplates;
}

export const api = {
  async loadAll(): Promise<AcademySnapshot> {
    const [
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
      settings,
    ] = await Promise.all([
      supabase.from('growing_students').select('*').order('created_at'),
      supabase.from('growing_classes').select('*').order('created_at'),
      supabase.from('growing_attendance').select('*'),
      supabase.from('growing_payments').select('*'),
      supabase.from('growing_counsel_logs').select('*'),
      supabase.from('growing_kiosk_alerts').select('*').order('created_at'),
      supabase.from('growing_homework_alerts').select('*').order('created_at'),
      supabase.from('growing_kakao_parent_links').select('*').order('verified_at', { ascending: false }),
      supabase.from('growing_parent_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('growing_kakao_events').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('growing_kakao_channels').select('*').order('created_at', { ascending: false }),
      supabase.from('growing_settings').select('*').maybeSingle(),
    ]);
    const error =
      students.error || classes.error || attendance.error || payments.error ||
      counselLogs.error || kioskAlerts.error || homeworkAlerts.error ||
      kakaoParentLinks.error || kakaoParentRequests.error || kakaoEventLogs.error || kakaoChannels.error || settings.error;
    if (error) throw error;

    return {
      students: (students.data ?? []).map(toStudent),
      classes: (classes.data ?? []).map(toClass),
      attendance: (attendance.data ?? []).map(toAttendance),
      payments: (payments.data ?? []).map(toPayment),
      counselLogs: (counselLogs.data ?? []).map(toCounselLog),
      kioskAlerts: (kioskAlerts.data ?? []).map(toKioskAlert),
      homeworkAlerts: (homeworkAlerts.data ?? []).map(toHomeworkAlert),
      kakaoParentLinks: (kakaoParentLinks.data ?? []).map(toKakaoParentLink),
      kakaoParentRequests: (kakaoParentRequests.data ?? []).map(toKakaoParentRequest),
      kakaoEventLogs: (kakaoEventLogs.data ?? []).map(toKakaoEventLog),
      kakaoChannels: (kakaoChannels.data ?? []).map(toKakaoChannelConfig),
      kioskPin: (settings.data?.kiosk_pin as string) ?? '1234',
      messageTemplates: mergeTemplates(settings.data?.message_templates as Partial<MessageTemplates> | null),
    };
  },

  // ---- Students ----
  async addStudent(data: Omit<Student, 'id'>): Promise<Student> {
    const { data: row, error } = await supabase
      .from('growing_students')
      .insert({
        name: data.name,
        school: data.school,
        grade: data.grade,
        contact: data.contact,
        parent_contact: data.parentContact,
        registration_date: orNull(data.registrationDate),
        status: data.status,
        memo: data.memo,
      })
      .select()
      .single();
    if (error) throw error;
    return toStudent(row);
  },

  async updateStudent(student: Student): Promise<Student> {
    const { data: row, error } = await supabase
      .from('growing_students')
      .update({
        name: student.name,
        school: student.school,
        grade: student.grade,
        contact: student.contact,
        parent_contact: student.parentContact,
        registration_date: orNull(student.registrationDate),
        status: student.status,
        memo: student.memo,
      })
      .eq('id', student.id)
      .select()
      .single();
    if (error) throw error;
    return toStudent(row);
  },

  async deleteStudent(id: string): Promise<void> {
    // Related attendance/payments/logs/alerts cascade via FK.
    const { error } = await supabase.from('growing_students').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Classes ----
  async addClass(data: Omit<Class, 'id'>): Promise<Class> {
    const schedules = data.schedules?.length ? data.schedules : data.days.map(day => ({ day, startTime: data.startTime, endTime: data.endTime }));
    const legacy = deriveLegacyClassScheduleFields(schedules);
    const { data: row, error } = await supabase
      .from('growing_classes')
      .insert({
        name: data.name,
        days: legacy.days,
        start_time: legacy.startTime,
        end_time: legacy.endTime,
        schedules,
        tuition_fee: data.tuitionFee,
        tuition_overrides: data.tuitionOverrides ?? {},
        student_ids: data.studentIds,
        color: data.color ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toClass(row);
  },

  async updateClass(cls: Class): Promise<Class> {
    const schedules = cls.schedules?.length ? cls.schedules : cls.days.map(day => ({ day, startTime: cls.startTime, endTime: cls.endTime }));
    const legacy = deriveLegacyClassScheduleFields(schedules);
    const { data: row, error } = await supabase
      .from('growing_classes')
      .update({
        name: cls.name,
        days: legacy.days,
        start_time: legacy.startTime,
        end_time: legacy.endTime,
        schedules,
        tuition_fee: cls.tuitionFee,
        tuition_overrides: cls.tuitionOverrides ?? {},
        student_ids: cls.studentIds,
        color: cls.color ?? null,
      })
      .eq('id', cls.id)
      .select()
      .single();
    if (error) throw error;
    return toClass(row);
  },

  async deleteClass(id: string): Promise<void> {
    const { error } = await supabase.from('growing_classes').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Attendance ----
  async insertAttendance(a: Omit<Attendance, 'id'>): Promise<Attendance> {
    const { data: row, error } = await supabase
      .from('growing_attendance')
      .insert({
        student_id: a.studentId,
        class_id: classIdParam(a.classId),
        date: a.date,
        status: a.status,
        memo: a.memo ?? '',
        homework_status: a.homeworkStatus ?? '',
        check_in_time: orNull(a.checkInTime),
        check_out_time: orNull(a.checkOutTime),
        makeup_for_date: orNull(a.makeupForDate),
        supplement_minutes: a.supplementMinutes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toAttendance(row);
  },

  async updateAttendance(
    id: string,
    fields: {
      status: AttendanceStatus;
      memo: string;
      homeworkStatus: HomeworkStatus | '';
      checkInTime?: string;
      checkOutTime?: string;
      makeupForDate?: string;
      supplementMinutes?: number;
    }
  ): Promise<Attendance> {
    const { data: row, error } = await supabase
      .from('growing_attendance')
      .update({
        status: fields.status,
        memo: fields.memo,
        homework_status: fields.homeworkStatus,
        check_in_time: orNull(fields.checkInTime),
        check_out_time: orNull(fields.checkOutTime),
        makeup_for_date: orNull(fields.makeupForDate),
        supplement_minutes: fields.supplementMinutes ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toAttendance(row);
  },

  async deleteAttendance(id: string): Promise<void> {
    const { error } = await supabase.from('growing_attendance').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Payments ----
  async insertPayment(p: Omit<Payment, 'id'>): Promise<Payment> {
    const { data: row, error } = await supabase
      .from('growing_payments')
      .insert({
        student_id: p.studentId,
        billing_month: p.billingMonth,
        amount: p.amount,
        payment_date: orNull(p.paymentDate),
        payment_method: orNull(p.paymentMethod),
        status: p.status,
      })
      .select()
      .single();
    if (error) throw error;
    return toPayment(row);
  },

  async insertPayments(ps: Omit<Payment, 'id'>[]): Promise<Payment[]> {
    if (ps.length === 0) return [];
    const { data: rows, error } = await supabase
      .from('growing_payments')
      .insert(
        ps.map(p => ({
          student_id: p.studentId,
          billing_month: p.billingMonth,
          amount: p.amount,
          payment_date: orNull(p.paymentDate),
          payment_method: orNull(p.paymentMethod),
          status: p.status,
        }))
      )
      .select();
    if (error) throw error;
    return (rows ?? []).map(toPayment);
  },

  async updatePayment(
    id: string,
    fields: { status: PaymentStatus; paymentDate?: string; paymentMethod?: PaymentMethod }
  ): Promise<Payment> {
    const { data: row, error } = await supabase
      .from('growing_payments')
      .update({
        status: fields.status,
        payment_date: orNull(fields.paymentDate),
        payment_method: orNull(fields.paymentMethod),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toPayment(row);
  },

  async deletePayment(id: string): Promise<void> {
    const { error } = await supabase.from('growing_payments').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Counsel logs ----
  async addCounselLog(data: Omit<CounselLog, 'id'>): Promise<CounselLog> {
    const { data: row, error } = await supabase
      .from('growing_counsel_logs')
      .insert({
        student_id: data.studentId,
        date: data.date,
        title: data.title,
        content: data.content,
        type: data.type,
        score: orNull(data.score),
      })
      .select()
      .single();
    if (error) throw error;
    return toCounselLog(row);
  },

  async updateCounselLog(log: CounselLog): Promise<CounselLog> {
    const { data: row, error } = await supabase
      .from('growing_counsel_logs')
      .update({
        date: log.date,
        title: log.title,
        content: log.content,
        type: log.type,
        score: orNull(log.score),
      })
      .eq('id', log.id)
      .select()
      .single();
    if (error) throw error;
    return toCounselLog(row);
  },

  async deleteCounselLog(id: string): Promise<void> {
    const { error } = await supabase.from('growing_counsel_logs').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Kiosk alerts ----
  async addKioskAlert(studentId: string, kind: 'in' | 'out', date: string, time: string): Promise<KioskAlert> {
    const { data: row, error } = await supabase
      .from('growing_kiosk_alerts')
      .insert({ student_id: studentId, kind, date, time })
      .select()
      .single();
    if (error) throw error;
    return toKioskAlert(row);
  },

  async deleteKioskAlert(id: string): Promise<void> {
    const { error } = await supabase.from('growing_kiosk_alerts').delete().eq('id', id);
    if (error) throw error;
  },

  async clearKioskAlerts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from('growing_kiosk_alerts').delete().in('id', ids);
    if (error) throw error;
  },

  // ---- Homework alerts ----
  async addHomeworkAlert(studentId: string, date: string, homeworkStatus: Exclude<HomeworkStatus, ''>): Promise<HomeworkAlert> {
    const { data: row, error } = await supabase
      .from('growing_homework_alerts')
      .insert({ student_id: studentId, date, homework_status: homeworkStatus })
      .select()
      .single();
    if (error) throw error;
    return toHomeworkAlert(row);
  },

  async deleteHomeworkAlert(id: string): Promise<void> {
    const { error } = await supabase.from('growing_homework_alerts').delete().eq('id', id);
    if (error) throw error;
  },

  async clearHomeworkAlerts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from('growing_homework_alerts').delete().in('id', ids);
    if (error) throw error;
  },

  // ---- Kakao channel bot prep ----
  async updateKakaoParentRequestStatus(id: string, status: KakaoParentRequestStatus): Promise<KakaoParentRequest> {
    const resolvedAt = status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null;
    const { data: row, error } = await supabase
      .from('growing_parent_requests')
      .update({ status, resolved_at: resolvedAt })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toKakaoParentRequest(row);
  },

  async saveKakaoChannelConfig(
    ownerId: string,
    config: { id?: string; channelName: string; skillSecret: string; eventSecret?: string; enabled: boolean }
  ): Promise<KakaoChannelConfig> {
    const payload = {
      owner_id: ownerId,
      channel_name: config.channelName,
      skill_secret: config.skillSecret,
      event_secret: config.eventSecret || null,
      enabled: config.enabled,
      updated_at: new Date().toISOString(),
    };
    const query = config.id
      ? supabase.from('growing_kakao_channels').update(payload).eq('id', config.id)
      : supabase.from('growing_kakao_channels').insert(payload);
    const { data: row, error } = await query.select().single();
    if (error) throw error;
    return toKakaoChannelConfig(row);
  },

  // ---- Settings ----
  async setKioskPin(ownerId: string, pin: string): Promise<void> {
    const { error } = await supabase
      .from('growing_settings')
      .upsert({ owner_id: ownerId, kiosk_pin: pin, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  async setMessageTemplates(ownerId: string, templates: MessageTemplates): Promise<void> {
    const { error } = await supabase
      .from('growing_settings')
      .upsert({ owner_id: ownerId, message_templates: templates, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  // ---- 아이비 기억 설정 ----
  async getAssistantMemory(): Promise<string> {
    const { data } = await supabase
      .from('growing_assistant_memory')
      .select('memory_text')
      .maybeSingle();
    return (data?.memory_text as string | null) ?? '';
  },

  async setAssistantMemory(text: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');
    const { error } = await supabase
      .from('growing_assistant_memory')
      .upsert({ owner_id: user.id, memory_text: text, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  // ---- 아이비 자가학습 노트 ----
  async listAssistantNotes(): Promise<{ id: string; scope: string; category: string; content: string; studentName: string; createdAt: string }[]> {
    const [notesRes, studentsRes] = await Promise.all([
      supabase.from('growing_assistant_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('growing_students').select('id, name'),
    ]);
    if (notesRes.error) throw notesRes.error;
    const nameById = new Map((studentsRes.data ?? []).map(s => [s.id as string, s.name as string]));
    return (notesRes.data ?? []).map(r => ({
      id: r.id as string,
      scope: r.scope as string,
      category: r.category as string,
      content: r.content as string,
      studentName: r.student_id ? (nameById.get(r.student_id as string) ?? '') : '',
      createdAt: r.created_at as string,
    }));
  },

  async deleteAssistantNote(id: string): Promise<void> {
    const { error } = await supabase.from('growing_assistant_notes').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Message logs ----
  async getMessageLogs(limit = 50): Promise<MessageLog[]> {
    const { data, error } = await supabase
      .from('growing_message_logs')
      .select('id, student_id, alert_type, recipient_phone, recipient_name, subject, message, status, error_message, created_at, sent_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(r => ({
      id: s(r.id),
      studentId: r.student_id ? s(r.student_id) : null,
      alertType: s(r.alert_type) as MessageLog['alertType'],
      recipientPhone: s(r.recipient_phone),
      recipientName: r.recipient_name ? s(r.recipient_name) : null,
      subject: s(r.subject),
      message: s(r.message),
      status: s(r.status) as MessageLog['status'],
      errorMessage: r.error_message ? s(r.error_message) : null,
      createdAt: s(r.created_at),
      sentAt: r.sent_at ? s(r.sent_at) : null,
    }));
  },

  // ---- Bulk: delete all of the signed-in owner's academy rows (RLS-scoped) ----
  async clearAll(): Promise<void> {
    // Order respects FKs; students last (cascades the rest), classes before.
    const tables = [
      'growing_kiosk_alerts',
      'growing_homework_alerts',
      'growing_counsel_logs',
      'growing_payments',
      'growing_attendance',
      'growing_classes',
      'growing_students',
    ];
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().not('id', 'is', null);
      if (error) throw error;
    }
  },
};
