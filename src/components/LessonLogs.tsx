import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Attendance, Class, EditableAttendanceStatus, HolidaySettings, Student } from '../types';
import { localMonth, localToday } from '../lib/dateUtils';
import { getClassSchedules } from '../lib/classSchedules';
import {
  buildMonthRows,
  closedTitle,
  exportMonthToExcel,
  formatRowDate,
  formatRowTime,
  isAbsent,
  lessonLogsApi,
  monthDates,
  publicHolidayNames,
  shiftMonth,
  suggestContents,
  toggleClosedDay,
  weekdayOf,
  type ContentHistoryItem,
  type LessonLog,
  type LessonRow,
} from '../lib/lessonLogs';
import './LessonLogs.css';

interface LessonLogsProps {
  classes: Class[];
  students: Student[];
  attendance: Attendance[];
  holidaySettings: HolidaySettings;
  onSaveHolidaySettings: (settings: HolidaySettings) => Promise<boolean>;
  onSaveAttendance: (data: { studentId: string; classId: string; date: string; status: EditableAttendanceStatus }) => Promise<unknown>;
}

type Feedback = { tone: 'success' | 'error'; message: string } | null;
type SaveState = 'saving' | 'saved' | 'error';

const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return '같은 날, 같은 반, 같은 시작 시각의 수업이 이미 있어요.';
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return '잠시 후 다시 시도해 주세요.';
};

const DOUBLE_TAP_MS = 350;

export function LessonLogs({ classes, students, attendance, holidaySettings, onSaveHolidaySettings, onSaveAttendance }: LessonLogsProps) {
  const [month, setMonth] = useState(localMonth());
  const [logs, setLogs] = useState<LessonLog[]>([]);
  const [history, setHistory] = useState<ContentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [classFilter, setClassFilter] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([lessonLogsApi.listMonth(month), lessonLogsApi.listHistory()])
      .then(([monthLogs, contents]) => {
        if (!active) return;
        setLogs(monthLogs);
        setHistory(contents);
        setLoadError('');
      })
      .catch(error => {
        if (active) setLoadError(`수업 일지를 불러오지 못했습니다: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  const { rows, closedDays } = useMemo(
    () => buildMonthRows({ month, classes, students, logs, holidaySettings }),
    [month, classes, students, logs, holidaySettings],
  );
  const visibleRows = rows.filter(row => (!classFilter || row.classId === classFilter) && (showHidden || !row.hidden));
  const hiddenCount = rows.filter(row => row.hidden && (!classFilter || row.classId === classFilter)).length;
  const today = localToday();

  const changeMonth = (next: string) => {
    setLoading(true);
    setDrafts({});
    setSaveStates({});
    setMonth(next);
  };

  const upsertLog = (saved: LessonLog) => {
    setLogs(current => [...current.filter(log => log.id !== saved.id), saved]);
  };

  const saveRow = async (row: LessonRow, patch: Partial<Pick<LessonRow, 'content' | 'hidden'>>) => {
    setSaveStates(current => ({ ...current, [row.key]: 'saving' }));
    try {
      const saved = await lessonLogsApi.save({ ...row, ...patch });
      upsertLog(saved);
      if (patch.content?.trim()) {
        setHistory(current => [{ content: patch.content!.trim(), classId: row.classId, date: row.date }, ...current]);
      }
      setSaveStates(current => ({ ...current, [row.key]: 'saved' }));
      return true;
    } catch (error) {
      setSaveStates(current => ({ ...current, [row.key]: 'error' }));
      setFeedback({ tone: 'error', message: `저장하지 못했습니다: ${errorMessage(error)}` });
      return false;
    }
  };

  const commitContent = async (row: LessonRow, value: string) => {
    const content = value.trim();
    if (content === row.content.trim()) return;
    if (await saveRow(row, { content })) {
      setDrafts(current => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
    }
  };

  const toggleAbsent = async (row: LessonRow, studentId: string) => {
    if (!row.classId) return;
    const absent = isAbsent(attendance, studentId, row.classId, row.date);
    await onSaveAttendance({ studentId, classId: row.classId, date: row.date, status: absent ? 'present' : 'absent' });
  };

  const removeRow = async (row: LessonRow) => {
    if (!row.logId) return;
    if (!window.confirm(`${formatRowDate(row.date)} ${row.className} 줄을 삭제할까요?`)) return;
    try {
      await lessonLogsApi.remove(row.logId);
      setLogs(current => current.filter(log => log.id !== row.logId));
    } catch (error) {
      setFeedback({ tone: 'error', message: `삭제하지 못했습니다: ${errorMessage(error)}` });
    }
  };

  const nameOf = (id: string) => students.find(student => student.id === id)?.name ?? '(삭제된 학생)';

  // 휴강일 줄을 날짜 순서에 끼워 넣는다.
  const closedByDate = new Map(closedDays.map(day => [day.date, day.title]));
  const lines: ({ kind: 'closed'; date: string; title: string } | { kind: 'row'; row: LessonRow })[] = [];
  const shownClosed = new Set<string>();
  const pushClosedUntil = (date: string | null) => {
    for (const day of closedDays) {
      if (shownClosed.has(day.date) || (date !== null && day.date > date)) continue;
      if (classFilter && !classes.find(cls => cls.id === classFilter && getClassSchedules(cls).some(s => s.day === weekdayOf(day.date)))) {
        shownClosed.add(day.date);
        continue;
      }
      shownClosed.add(day.date);
      lines.push({ kind: 'closed', date: day.date, title: day.title });
    }
  };
  const lineDate = (line: typeof lines[number]) => (line.kind === 'row' ? line.row.date : line.date);
  for (const row of visibleRows) {
    pushClosedUntil(row.date);
    lines.push({ kind: 'row', row });
  }
  pushClosedUntil(null);

  return (
    <div className="ll-root">
      <section className="ll-toolbar">
        <div className="ll-month">
          <button className="btn btn-secondary" type="button" aria-label="이전 달" onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
          <strong>{month.replace('-', '년 ')}월</strong>
          <button className="btn btn-secondary" type="button" aria-label="다음 달" onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
        </div>
        <select className="form-control ll-filter" value={classFilter} onChange={event => setClassFilter(event.target.value)} aria-label="반 고르기">
          <option value="">모든 반</option>
          {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </select>
        <div className="ll-actions">
          <button className={`btn ${showHolidays ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setShowHolidays(current => !current)}>
            <CalendarOff size={16} /> 휴강일 설정
          </button>
          <button className={`btn ${showAdd ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setShowAdd(current => !current)}>
            <Plus size={16} /> 줄 추가
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportMonthToExcel(month, visibleRows, students, attendance)} disabled={visibleRows.length === 0}>
            <Download size={16} /> 엑셀
          </button>
        </div>
      </section>

      {feedback && (
        <div className={`lm-alert ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          {feedback.tone === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}
          <span>{feedback.message}</span>
          <button className="ll-alert-close" type="button" aria-label="닫기" onClick={() => setFeedback(null)}><X size={14} /></button>
        </div>
      )}

      {showHolidays && (
        <HolidayPicker month={month} settings={holidaySettings} onSave={onSaveHolidaySettings} onFeedback={setFeedback} />
      )}

      {showAdd && (
        <AddRowForm
          month={month}
          classes={classes}
          students={students}
          onAdded={saved => {
            upsertLog(saved);
            setShowAdd(false);
            setFeedback({ tone: 'success', message: `${formatRowDate(saved.date)} ${saved.className} 줄을 추가했습니다.` });
          }}
          onFeedback={setFeedback}
        />
      )}

      <section className="ll-card">
        <p className="ll-help">
          학생 이름을 <b>두 번 누르면</b> 결석(빨간 줄)으로 출결에 저장되고, 다시 두 번 누르면 출석으로 돌아가요.
          수업내용은 몇 글자만 적으면 지난 기록이 아래에 떠요.
        </p>
        {loading ? (
          <div className="lm-empty" role="status"><b>불러오는 중...</b></div>
        ) : loadError ? (
          <div className="lm-empty lm-load-error" role="alert">
            <span>{loadError}</span>
            <button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey(key => key + 1); }}>다시 불러오기</button>
          </div>
        ) : lines.length === 0 ? (
          <div className="lm-empty"><b>이 달에 수업이 없어요.</b><span>반 / 시간표에 요일과 시간을 넣거나 ‘줄 추가’로 직접 넣어 주세요.</span></div>
        ) : (
          <div className="ll-table-wrap">
            <table className="ll-table">
              <thead>
                <tr>
                  <th className="ll-col-date">날짜(요일)</th>
                  <th className="ll-col-time">시간대</th>
                  <th className="ll-col-class">클래스명</th>
                  <th className="ll-col-students">학생 이름</th>
                  <th>수업내용</th>
                  <th className="ll-col-act" aria-label="줄 관리" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const prevDate = index > 0 ? lineDate(lines[index - 1]) : '';
                  if (line.kind === 'closed') {
                    return (
                      <tr key={`closed-${line.date}`} className="ll-closed">
                        <td className="ll-col-date">{formatRowDate(line.date)}</td>
                        <td colSpan={5}>{line.title === '휴강' ? '휴강' : `휴강 · ${line.title}`}</td>
                      </tr>
                    );
                  }
                  const { row } = line;
                  const state = saveStates[row.key];
                  return (
                    <tr key={row.key} className={`${row.hidden ? 'll-hidden' : ''}${row.date === today ? ' ll-today' : ''}${prevDate !== row.date ? ' ll-newday' : ''}`}>
                      <td className="ll-col-date">{prevDate === row.date ? <span className="ll-same">〃</span> : formatRowDate(row.date)}</td>
                      <td className="ll-col-time">{formatRowTime(row)}</td>
                      <td className="ll-col-class">
                        {row.className}
                        {!row.fromSchedule && <span className="ll-tag">추가</span>}
                        {closedByDate.has(row.date) && <span className="ll-tag warn">휴강일</span>}
                      </td>
                      <td className="ll-col-students">
                        {row.studentIds.length === 0 ? <span className="ll-muted">학생 없음</span> : row.studentIds.map(id => (
                          <StudentChip
                            key={id}
                            name={nameOf(id)}
                            absent={isAbsent(attendance, id, row.classId, row.date)}
                            disabled={!row.classId}
                            onDoubleTap={() => void toggleAbsent(row, id)}
                          />
                        ))}
                      </td>
                      <td className="ll-col-content">
                        <ContentInput
                          value={drafts[row.key] ?? row.content}
                          suggestions={history}
                          classId={row.classId}
                          onChange={value => setDrafts(current => ({ ...current, [row.key]: value }))}
                          onCommit={value => void commitContent(row, value)}
                        />
                        {state === 'saving' && <span className="ll-state">저장 중</span>}
                        {state === 'saved' && <span className="ll-state ok">저장됨</span>}
                        {state === 'error' && <span className="ll-state err">저장 실패</span>}
                      </td>
                      <td className="ll-col-act">
                        {row.hidden ? (
                          <button className="ll-icon" type="button" title="다시 보이기" aria-label="다시 보이기" onClick={() => void saveRow(row, { hidden: false })}><Eye size={15} /></button>
                        ) : row.fromSchedule ? (
                          <button className="ll-icon" type="button" title="이 날만 숨기기 (그 반만 쉬는 날)" aria-label="이 날만 숨기기" onClick={() => void saveRow(row, { hidden: true })}><EyeOff size={15} /></button>
                        ) : (
                          <button className="ll-icon danger" type="button" title="줄 삭제" aria-label="줄 삭제" onClick={() => void removeRow(row)}><Trash2 size={15} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hiddenCount > 0 && (
          <button className="ll-link" type="button" onClick={() => setShowHidden(current => !current)}>
            {showHidden ? '숨긴 줄 감추기' : `숨긴 줄 ${hiddenCount}개 보기`}
          </button>
        )}
      </section>
    </div>
  );
}

// 학생 이름: 두 번 누르면(마우스 더블클릭·휴대폰 두 번 탭) 결석 ↔ 출석.
function StudentChip({ name, absent, disabled, onDoubleTap }: { name: string; absent: boolean; disabled: boolean; onDoubleTap: () => void }) {
  const lastTap = useRef(0);
  return (
    <button
      type="button"
      className={`ll-student${absent ? ' absent' : ''}`}
      disabled={disabled}
      title={absent ? '결석 · 두 번 누르면 출석으로' : '두 번 누르면 결석'}
      aria-pressed={absent}
      onClick={event => {
        const now = event.timeStamp;
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          onDoubleTap();
        } else {
          lastTap.current = now;
        }
      }}
    >
      {name}
    </button>
  );
}

// 수업내용 칸: 적는 글자가 들어간 지난 기록을 아래에 띄운다(↑↓ 고르기, Enter 넣기).
function ContentInput({
  value,
  suggestions,
  classId,
  onChange,
  onCommit,
}: {
  value: string;
  suggestions: ContentHistoryItem[];
  classId: string | null;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = open ? suggestContents(suggestions, value, classId) : [];

  const pick = (text: string) => {
    onChange(text);
    setOpen(false);
    setActive(-1);
    onCommit(text);
  };

  return (
    <div className="ll-content">
      <input
        className="form-control"
        value={value}
        maxLength={2000}
        placeholder="수업내용"
        onChange={event => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onCommit(value);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault();
            setActive(current => (current + 1) % options.length);
          } else if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault();
            setActive(current => (current <= 0 ? options.length - 1 : current - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (active >= 0 && options[active]) pick(options[active]);
            else {
              setOpen(false);
              onCommit(value);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {options.length > 0 && (
        <ul className="ll-suggest" role="listbox">
          {options.map((text, index) => (
            <li
              key={text}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'on' : ''}
              onMouseDown={event => {
                event.preventDefault();
                pick(text);
              }}
            >
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 휴강일 달력: 날짜를 누르면 수업일 ↔ 휴강. 학원 휴원일(카카오 안내)과 같은 달력이다.
function HolidayPicker({
  month,
  settings,
  onSave,
  onFeedback,
}: {
  month: string;
  settings: HolidaySettings;
  onSave: (settings: HolidaySettings) => Promise<boolean>;
  onFeedback: (feedback: Feedback) => void;
}) {
  const [saving, setSaving] = useState('');
  const dates = monthDates(month);
  const lead = new Date(`${dates[0]}T00:00:00`).getDay();

  const toggle = async (date: string) => {
    setSaving(date);
    const ok = await onSave({ holidayAutoClose: settings.holidayAutoClose, calendarExceptions: toggleClosedDay(settings, date) });
    setSaving('');
    if (!ok) onFeedback({ tone: 'error', message: '휴강일을 저장하지 못했습니다.' });
  };

  return (
    <section className="ll-card ll-holidays">
      <div className="ll-holidays-head">
        <h3>{month.replace('-', '년 ')}월 휴강일</h3>
        <p>날짜를 누르면 휴강 ↔ 수업이 바뀌어요. 학원 휴원일 달력이라 카카오 채널 휴원 안내에도 같이 반영돼요.{settings.holidayAutoClose ? ' 공휴일은 자동으로 휴강이에요.' : ''}</p>
      </div>
      <div className="ll-cal">
        {['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day} className="ll-cal-dow">{day}</span>)}
        {Array.from({ length: lead }, (_, index) => <span key={`lead-${index}`} />)}
        {dates.map(date => {
          const closed = closedTitle(date, settings);
          const holiday = publicHolidayNames(date)[0];
          return (
            <button
              key={date}
              type="button"
              className={`ll-cal-day${closed !== null ? ' closed' : ''}${holiday ? ' holiday' : ''}`}
              disabled={Boolean(saving)}
              aria-pressed={closed !== null}
              title={closed ?? holiday ?? '수업일'}
              onClick={() => void toggle(date)}
            >
              <b>{Number(date.slice(8))}</b>
              <small>{saving === date ? '저장 중' : closed !== null ? closed : holiday ? '수업함' : ''}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AddRowForm({
  month,
  classes,
  students,
  onAdded,
  onFeedback,
}: {
  month: string;
  classes: Class[];
  students: Student[];
  onAdded: (log: LessonLog) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const today = localToday();
  const [date, setDate] = useState(today.startsWith(month) ? today : `${month}-01`);
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const cls = classes.find(item => item.id === classId);
  const schedule = cls ? getClassSchedules(cls).find(item => item.day === weekdayOf(date)) ?? getClassSchedules(cls)[0] : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!cls) return;
    setSaving(true);
    try {
      const activeIds = new Set(students.filter(student => student.status === 'active').map(student => student.id));
      const saved = await lessonLogsApi.save({
        date,
        startTime: startTime || schedule?.startTime || '',
        endTime: endTime || schedule?.endTime || '',
        classId: cls.id,
        className: cls.name,
        studentIds: (schedule?.studentIds ?? cls.studentIds).filter(id => activeIds.has(id)),
        content: '',
        logId: null,
        hidden: false,
      });
      onAdded(saved);
    } catch (error) {
      onFeedback({ tone: 'error', message: `줄을 추가하지 못했습니다: ${errorMessage(error)}` });
    } finally {
      setSaving(false);
    }
  };

  if (classes.length === 0) {
    return <section className="ll-card"><p className="ll-muted">먼저 반 / 시간표에서 반을 만들어 주세요.</p></section>;
  }

  return (
    <form className="ll-card ll-add" onSubmit={event => void submit(event)}>
      <label>날짜<input className="form-control" type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label>클래스
        <select className="form-control" value={classId} onChange={event => setClassId(event.target.value)}>
          {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>시작<input className="form-control" type="time" value={startTime} placeholder={schedule?.startTime} onChange={event => setStartTime(event.target.value)} /></label>
      <label>끝<input className="form-control" type="time" value={endTime} placeholder={schedule?.endTime} onChange={event => setEndTime(event.target.value)} /></label>
      <button className="btn btn-primary" type="submit" disabled={saving || !cls}><Plus size={16} /> {saving ? '추가 중...' : '추가'}</button>
      <p className="ll-muted">시간을 비우면 그 반의 그 요일 시간표({schedule ? `${schedule.startTime}-${schedule.endTime}` : '없음'})로 들어가요. 보강·특강처럼 시간표에 없는 수업에 써요.</p>
    </form>
  );
}
