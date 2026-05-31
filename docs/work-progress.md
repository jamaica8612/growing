# 작업 진행 상황 & 다음 작업 순서 (핸드오프)

> 이어서 작업할 때 이 문서를 먼저 읽으세요. 모든 작업은 `main` 브랜치에 직접 커밋·푸시하며,
> 푸시 시 GitHub Pages가 프론트엔드를 자동 배포합니다. Supabase 엣지 함수(`assistant`)는
> MCP `deploy_edge_function`으로 수동 배포합니다(이 환경엔 supabase CLI/토큰 없음).
> 프로젝트 ref: `xrrdokcjhjqdfvwtbenl`.

## 배포 경로 메모
- 프론트엔드: `git push origin main` → GitHub Actions(`.github/workflows/deploy.yml`) → GitHub Pages.
- 엣지 함수: 로컬 `supabase/functions/assistant/index.ts` 수정 → MCP `deploy_edge_function`
  (전체 파일 내용을 content로 전달). 현재 라이브 **v17**. verify_jwt=true 유지.
- DB 마이그레이션: MCP `apply_migration` 으로 적용 + `supabase/migrations/`에 파일 기록.

---

## ✅ 완료된 작업

### 학사 기능
- 요일별 개별 시간표(`schedules`), 학생별 수강료(`tuitionOverrides`)
- 퇴원=soft delete, 지각(late) 상태 제거 + 데이터/제약 정리
- **휴원(`paused`) 상태**: 반 배정 유지·청구/출결/통계/키오스크 제외, 휴원/복귀 버튼,
  월간 리포트는 재원+휴원 포함(퇴원만 제외)
- 보강(makeup)↔결석일 연결(`makeup_for_date`) + 연결 검증 힌트
- 대시보드 출결 집계 정확화(분자/분모 일치, 같은 요일 중복 제거, 휴원 제외)
- **대시보드 "오늘의 브리핑" 카드(규칙 기반·토큰 0)**: 미체크 인원·보강·미납·최근 결석 잦은 학생

### 아이비(AI 비서) — 엣지 함수 v17
- 읽기: 학생/반/출결/수납/상담 + **모든 growing_* 테이블 범용 조회**
  (`list_data_sources` + `query_table`, RPC `growing_list_tables()`로 미래 테이블 자동 인지)
- `query_table` 결과에 student_id→student_name 자동 보강
- 휴원 인지(status 필터 paused), 출결 집계는 재원생만
- **쓰기(승인 카드 방식)**: 출결 변경/등록, 수납 완납, **상담일지 작성(`propose_counsel_log`)**,
  **학생 메모 수정(`propose_student_memo`)**
- A 아침 브리핑(프롬프트 지침 + 채팅 빠른버튼), E 근거 명시·병렬 호출·토큰 2048
- **친절한 에러 메시지 + "다시 시도" 버튼**(네트워크/401/과부하/키 미설정 매핑)

### 상담일지
- **내보내기(마크다운 다운로드)** — `CounselLogs.tsx` `handleExport` (✅ 방금 완료)

---

## ⏳ 진행 예정 (다음 세션에서 이어서)

순서대로 진행. 모두 **프론트엔드 전용**(엣지 재배포 불필요), 빌드는 `npm run verify`.

### 1) 출석 추세 (AttendanceStats.tsx)
- 목적: 최근 3개월 출석률 추세를 보여줘 이탈 조짐 감지.
- 구현: `attendance` + `activeStudentIds`로 selectedMonth 포함 직전 3개월 rate 계산(useMemo).
  ```ts
  const trend = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [2,1,0].map(i => {
      const d = new Date(y, m-1-i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const recs = attendance.filter(a => a.date.startsWith(mo) && activeStudentIds.has(a.studentId));
      const attended = recs.filter(r => normalizeAttendanceStatus(r.status) !== 'absent').length;
      return { month: mo, total: recs.length, rate: recs.length ? Math.round(attended/recs.length*100) : -1 };
    });
  }, [attendance, selectedMonth, activeStudentIds]);
  ```
- 위치: KPI 그리드(라인 ~221) 다음, `<>` 블록 안에 카드로 렌더(막대 3개).

### 2) 위험군 탐지 D (AttendanceStats.tsx + App.tsx)
- App.tsx의 `<AttendanceStats ... />`에 `payments={payments}` prop 추가, Props/인터페이스에 `payments: Payment[]` 추가.
- selectedMonth 미납 집합 + 기존 `studentRows`(rate/absent) 결합한 "🚨 우선 관리 대상" 카드:
  ```ts
  const unpaidIds = new Set(payments.filter(p => p.billingMonth === selectedMonth && p.status === 'unpaid').map(p => p.studentId));
  const riskList = studentRows.map(r => ({ ...r, unpaid: unpaidIds.has(r.studentId) }))
    .filter(r => (r.total>0 && (r.rate<80 || r.absent>=3)) || r.unpaid)
    .sort((a,b) => (Number(b.unpaid)+Number(b.rate<80||b.absent>=3)) - (Number(a.unpaid)+Number(a.rate<80||a.absent>=3)));
  ```
- 각 항목에 사유 배지(출결/미납) 표시. KPI 그리드 다음에 카드로.

### 3) 반별 분석 (Classes.tsx)
- `getStudentClassTuition`(src/lib/classTuition.ts) import 추가.
- 클래스 그리드 위에 요약 카드: 반별 재원생 수 + 월 예상 수강료 합계(개별원비 반영), 전체 합계.
  ```ts
  const activeIdSet = new Set(students.filter(s=>s.status==='active').map(s=>s.id));
  // 반별: cls.studentIds.filter(id=>activeIdSet.has(id)) 수, sum(getStudentClassTuition(cls, id))
  ```

### 4) C — 의미검색 RAG (보류, 별도 세션 권장)
- 위험·대규모: pgvector 확장 + 임베딩 컬럼 + 기존 행 백필(Gemini 임베딩 API) +
  엣지 벡터검색 RPC + 신규 일지/노트 저장 시 임베딩 생성.
- 동작 중인 아이비 회귀 위험이 커서 단독으로 신중히 진행할 것.
- 대안(경량): 현재 substring 검색을 다중 필드/키워드 확장으로 보강.

---

## 검증/배포 체크리스트
- [ ] `npm run verify` (lint+build) 통과
- [ ] `git add -A && git commit && git push origin main`
- [ ] 엣지 함수 변경 시에만 MCP `deploy_edge_function`로 재배포(현재 불필요)
- [ ] 커밋 메시지 끝에 세션 링크 유지
