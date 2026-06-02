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
- **내보내기(마크다운 다운로드)** — `CounselLogs.tsx` `handleExport`

### 운영 분석
- **출결 통계 최근 3개월 추세 카드** — 선택 월 포함 3개월 출석률/기록 건수 표시
- **출결+미납 우선 관리 대상 카드** — 출석률 80% 미만·결석 3회 이상·해당 월 미납 학생 통합 표시
- **반별 수강료 분석 카드** — 재원생 기준 반별 인원과 개별 원비 반영 월 예상 수강료 집계

### 메시지 · UI
- **메시지 템플릿 설정화** — `src/lib/messageTemplates.ts` + Backup.tsx 편집 UI + Attendance/Messaging 사용 완료
- **출결 캘린더 뷰** — `AttendanceCalendar.tsx` 구현 후 `Attendance.tsx`에 연결 완료
- **Aligo 알림톡 API 준비** — `send-alimtalk` Edge Function + `growing_message_logs` 마이그레이션 + `ALIGO_SETUP_GUIDE.md` 작성
- **모바일/태블릿 UI 이슈 수정 (PR #30, 2026-06-02)**
  - 출결 로스터 테이블 overflow-x 컨테이너 (#4)
  - 월간 통계 테이블 모바일 열 축소 (#11)
  - 알림장 템플릿 버튼 단일 열 (#9)
  - 극소형 화면 숙제 세그먼트·시간 입력 스택 (#5)
- **UI 이슈 추가 수정 (2026-06-02)**
  - #15 대시보드 미납 카드 480px 이하 flex-wrap (#15)
  - #16 학생 상세 탭 overflow-x:auto 확인 완료 (이미 적용됨)

### 아이비 — RAG 의미검색 (엣지 함수 v23)
- **pgvector 의미검색**: `growing_counsel_logs` + `growing_assistant_notes` 임베딩 컬럼(vector 768)
- Gemini `text-embedding-004` 임베딩, IVFFlat 인덱스, 코사인 거리 RPC(`search_counsel_logs`, `search_assistant_notes`)
- `semantic_search` 도구: 질의 임베딩 → RPC 병렬 조회 → 유사도 정렬 반환
- `backfill_embeddings` 도구: 임베딩 없는 기존 행 최대 50건 백필

---

## ⏳ 진행 예정 (다음 세션에서 이어서)

순서대로 진행. 빌드는 `npm run build`.

### 1) 잔여 UI 이슈 (docs/ui-issues.md 미수정 항목)
- **#12/13/14** CSS 중복·상충 정리 (tabs-header, modal-content, notice-text-box)
- 외부 API 불필요, 엣지 함수 재배포 불필요.
- **#15** ✅ 완료 — `@media (max-width: 480px) { .gd-pay-row: flex-wrap:wrap }` 추가
- **#16** ✅ 완료 — `.st-tabs` overflow-x:auto 이미 적용되어 있음 (확인만)
- **#10** — 기능상 무해, 별도 CSS 리팩터링 세션에서 처리 권장

---

## 검증/배포 체크리스트
- [ ] `npm run verify` (lint+build) 통과
- [ ] `git add -A && git commit && git push origin main`
- [ ] 엣지 함수 변경 시에만 MCP `deploy_edge_function`로 재배포(현재 불필요)
- [ ] 커밋 메시지 끝에 세션 링크 유지
