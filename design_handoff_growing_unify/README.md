# Handoff: 그로잉영어 UI 통일 + 기능 정리 (jamaica8612/growing)

> **대상: Claude Code (또는 개발자).** 이 문서 하나로 작업을 시작할 수 있게 작성했습니다.
> `app/` 안의 파일은 **프로덕션 코드가 아니라 디자인 레퍼런스(React + 인라인 JSX 프로토타입)** 입니다.
> HTML/JSX를 그대로 이식하지 말고, **기존 `growing` 코드베이스(React 19 + TS + Vite + Supabase)의 패턴**(타입, props, `useAcademyData` 훅, `src/index.css`, `lucide-react`)에 맞춰 **재구현**하세요.

---

## 0. 절대 원칙 (먼저 읽기)

1. **데이터/로직은 한 줄도 바꾸지 않는다.** `useAcademyData`, `src/lib/api.ts`, 각 컴포넌트의 기존 props·콜백(`onSaveAttendance`, `onRecordPayment`, `onAddCounselLog` 등)을 **그대로** 통과시킵니다. 이번 작업은 **마크업 / 클래스 / 내비게이션 / 일부 기능 정리**만 합니다.
2. **토큰은 이미 정상이다.** 색(primary `#1b4b36`), 폰트(Outfit + Noto Sans KR), 반경·그림자 토큰(`--color-*` / `--radius-*` / `--shadow-*`)과 사랑받던 `.gd-*` 카드 시스템이 **이미 `src/index.css`에 살아 있습니다.** 새로 만들지 말고 **이걸 정본으로** 삼으세요. 프로토타입의 `--g-*`는 레퍼런스용 별칭일 뿐, 실제로는 기존 `--color-*`를 씁니다.
3. **충실도: High-fidelity.** 색/타이포/간격/인터랙션이 확정된 목업입니다. 픽셀 단위로 재현하되 스타일링은 기존 `index.css`/`lucide-react`로.

---

## 1. 무엇이 문제였나 (진단 요약)

브랜드는 멀쩡합니다. 무너진 건 **일관성**입니다.

- **CSS 2세대 공존** — `src/index.css`(179KB)에 옛 클래스(`.card` `.metric-card` `.makeup-*` `.kakao-*` `.settings-tabs` …)와 새 리디자인(`.gd-*`, 약 2,580줄~)이 **함께** 살아 있고, 새 화면이 둘을 섞어 씀.
- **컴포넌트 어휘 분열** — 탭 3종(`.flow-tab`/`.st-tab`/`.kakao-tabs`/`.tab-btn`), 버튼 6종, 모달 2종, `.msg-select`를 일반 인풋으로 오용.
- **내비게이션 3층 + 데드코드** — 사이드바(5) + 플로우 서브탭 + 바로가기 칩. `src/App.tsx`에 `void NAV_GROUPS`·`void TAB_TITLES`·`splice` 핵 잔존.
- **인터랙션 원칙 이탈** — `MakeupManager`가 `alert()` 3회(토스트 원칙 위반), 자체 `.mk-modal`.
- **평가(Exams)** — 137KB 컴포넌트 + 전용 `Exams.css`(20KB) = 디자인 섬. **새 4화면**(평가·보강·카카오·점검)은 모바일 분기도 부족.

---

## 2. 작업 1 — 내비게이션 정리

**데스크톱: 3층 → 1층 그룹 사이드바.** 13개 메뉴를 다 펼쳐 보여줍니다(원장님은 PC로 하루 종일 사용). 서브탭/바로가기 칩은 제거하고, 화면 간 이동이 필요하면 **각 화면 본문 상단 액션 버튼**으로.

### `src/navigation.ts` — `PRIMARY_NAV_GROUPS` 교체 (3그룹 13항목)

| 그룹 | 항목(id) |
|---|---|
| **그날 운영** | dashboard(오늘) · attendance(출결 관리) · makeup(보강·보충) · messaging(알림장) · kiosk(키오스크 시작) |
| **원생 · 수업** | students(학생 관리) · classes(반/시간표) · exams(평가 관리) · payments(수납 관리) |
| **기록 · 분석** | counsel(상담/진도) · stats(출결 통계) · kakao(카카오 채널) · data-quality(데이터 점검) |
| (푸터) | backup(설정) |

- 핵심 변화: **출결·보강을 1단계로 승격**(매일 쓰는 업무), **평가를 정식 메뉴로**, **데이터 점검/카카오를 "기록·분석"으로** 모음.
- **모바일**: 하단 5탭(오늘·출결·알림장·학생·**더보기**) + "더보기"는 전체 메뉴 시트. `MOBILE_QUICK_NAV_ITEMS` 갱신.

### `src/App.tsx` — 데드코드 제거
- 삭제: `const NAV_GROUPS = […]`, 로컬 `TAB_TITLES`, `NAV_GROUPS[1]?.items.splice(…)`, `void NAV_GROUPS; void TAB_TITLES;`
- `renderWorkflowShortcuts()`의 `.flow-tabs`/`.flow-chip`(데스크톱) 제거 → 화면 본문 액션 버튼으로 대체. (단순 이동은 기존 `onNavigate` 콜백 재사용)

참조 구현: `app/app-shell.jsx`(그룹 사이드바 + 모바일 5탭+더보기 시트 + 토픽바 액션 + 토스트).

---

## 3. 작업 2 — 컴포넌트 어휘 통일 ("같은 역할 = 같은 클래스")

| 역할 | 제거/병합 | 정본 클래스 |
|---|---|---|
| 카드 | `.card` `.metric-card` `.makeup-summary-card` | `.gd-card` · `.gd-stat` |
| 탭 | `.settings-tabs` `.kakao-tabs` `.tab-btn` | `.st-tab`(상세) · `.ka-tab`(화면) |
| 세그먼트 | `.makeup-filter-tabs` | `.gd-seg` / `.gd-seg-b` |
| 버튼 | `.at-act` `.mk-btn` 산발 | `.pay-btn` + `.primary/.ghost/.sm` |
| 상태 배지 | `.kakao-status` | `.at-pill` + `.ok/.warn/.danger/.info` |
| 인풋 | `.msg-select`(의미 불일치) | `.gd-field`(input·select 공통) |
| 모달 | `.mk-modal` | `.modal-content` |
| 피드백 | `alert()` `confirm()` | `.gd-toast` + 인라인 에러 |

- `MakeupManager.tsx`: `alert(...)` 3곳 → 토스트+인라인 검증, `.mk-modal` → `.modal-content`, `.msg-select` → `.gd-field`.
- `src/index.css` **다이어트**: 화면이 정본으로 옮겨질 때마다 2,580줄 **위쪽** 레거시 클래스를 삭제 → 목표 절반 크기.

---

## 4. 작업 3 — 새 4화면을 `.gd` 시스템으로 흡수

`app/new-screens.jsx`의 마크업·클래스를 기존 컴포넌트로 옮깁니다. **계산 로직(lib)은 그대로.**

| 화면 / 파일 | 레퍼런스 | 핵심 |
|---|---|---|
| 보강·보충 `MakeupManager.tsx` | `GrowingMakeup` + `.mk-*` | 현황 배너(`.gx-banner`) + `.gd-seg` + 카드 그리드. `getMakeupSummary`/`getMakeupRecommendations` 유지 |
| 평가 관리 `Exams.tsx` | `GrowingExams` + `.ex-*` | KPI 4 + 평가 목록 행(응시 진행바·평균·상태). `lib/exams.ts`·제출/배포 로직 전부 유지, **비주얼만** |
| 카카오 채널 `KakaoManager.tsx` | `GrowingKakao` + `.ka-*` | `.ka-tab` 3탭(요청큐/연결/설정). 콜백 그대로 |
| 데이터 점검 `DataQuality.tsx` | `GrowingDataQuality` + `.dq-*` | KPI 3 + `.dq-grid` 이슈 카드. `getDataQualitySections` 그대로 |

- **모바일 분기 필수**: 네 화면 모두 `@media(max-width:600px)`에서 단일 컬럼(`.gd-mobile .ex-row`, `.dq-grid`, `.mk-cards` 1fr). `app/additions.css` 하단 규칙 참조.
- **평가(Exams) 비주얼 통합**: `Exams.css`의 색·간격·헤더·카드·버튼을 `--color-*` 토큰 + `.gd-*` 패턴으로 교체. **기능·외부 응시 라우트(`#/exam/…`)·채점 로직은 절대 변경 금지.**

---

## 5. 확정된 단순화 결정 (원장님 직접 결정 — 반드시 반영)

- **알림장 = 종합 알림장 1종.** 등원/하원/과제/보강/평가 개별 템플릿 UI 제거. 오늘의 등·하원·숙제·보강을 한 번에 묶은 종합 메시지만.
  - **발송 대기 = 학생별 종합 1행**(요약 칩). 옛 "이벤트별 행" 폐기. 행의 "편집"으로 편집기에 로드.
  - **본문은 선생님이 직접 수정 가능**(`<textarea>`). 학생 변경 시 자동 생성본으로 초기화(되돌리기 제공). 복사/전송은 편집본 기준. → `app/growing-messaging.jsx`
- **출결 관리: 개별 카톡/문자 버튼 제거.** "학부모 알림" 컬럼 삭제 → 표 **5컬럼**(학생/등·하원/출결/숙제/메모), `grid-template-columns` 조정. → `Attendance.tsx`
- **설정: 알림 템플릿 = 종합 알림장 1종.** `TEMPLATE_META`(5종)를 종합 템플릿 1개 `<textarea>`로. 토큰 `{학생명}{등원시간}{하원시간}{숙제상태}{보강}`. → `Backup.tsx`
- **상담/진도: 메뉴 유지, "알림장" 보내기 버튼만 제거.** "안내 복사"는 유지. → `CounselLogs.tsx`
- **아이비(AI 비서): 우하단 플로팅 반드시 유지.** 통일 셸에서 빠지지 않게(FAB + 패널). → `Assistant.tsx`, 참조 `app/app-shell.jsx`의 `Ivy`
- **키오스크: 현행 그대로 유지.** 변경하지 않음. → `Kiosk.tsx`

---

## 6. 반응형 (중요)

- **태블릿이 모바일로 무너지는 문제.** 현재 모든 모바일 전환이 `@media(max-width:768px)`라 아이패드 세로(768~834px)가 핸드폰 레이아웃으로 보임. → **기준을 `600px`(또는 640)로 낮춰** 진짜 폰만 단일 컬럼. 601~1024px(태블릿)은 데스크탑 레이아웃 + 기존 `@media(max-width:1024px/1200px)` 컬럼 축소로 처리. 하단 탭·드로어 같은 모바일 전용 내비 표시 기준은 별도 관리.
- **시간표 모바일 풀-핏.** 주간 시간표가 `54px repeat(5,minmax(110px,1fr))`=604px라 폰에서 가로 스크롤. `@media(max-width:600px)`에서 `30px repeat(5,minmax(0,1fr))` + 슬롯 폰트 축소 + `overflow-x:hidden`으로 **한 화면에**. → `Classes.tsx`, 참조 `app/additions.css`.

---

## 7. 새 기능 (채택: 1 · 4 · 6) — 기존 스키마 위에 얹기

1. **아이비 카카오 자동응답** (`KakaoManager.tsx` + Edge Function `kakao-skill`)
   - 연동 설정에 **자동응답 토글**. ON이면 **출결·숙제 문의**(`type: attendance|homework`)는 아이비가 DB 조회 후 즉시 자동 답변 → 요청 큐에서 "자동 처리됨" 표시·대기 수 제외. **상담·연결 요청은 자동 처리하지 않고 큐에 남김.**
   - 구현: Edge Function에서 의도 분류 → 출결/숙제면 DB 조회 답변, 그 외 `pending` 적재. 기존 `kakaoParentRequests` 흐름 재사용.
4. **월간 성장 리포트** (`CounselLogs.tsx` 모달, AI 미사용)
   - 상담/진도 툴바 "월간 리포트" → 모달. 학생별 **출석률·숙제 수행률·평가 추세·상담 하이라이트**를 그 달 데이터로 집계(`attendance`+`counselLogs`, 기존 `lib/reportSummary.ts` 재사용). 인쇄/PDF + 종합 알림장 전송.
6. **반 정원 + 대기자** (`Classes.tsx` + 타입/DB)
   - `Class` 타입에 `capacity: number`, `waitlist: string[]` 추가(Supabase `classes` 컬럼 마이그레이션). 클래스 카드에 재원/정원 바 + "정원 마감" 배지 + 대기자 칩. 정원 차면 신규 배정 막고 대기자로.

---

## 8. 화면 ↔ 참조 파일

| 실제 파일 | 프로토타입 참조 |
|---|---|
| `App.tsx` / `navigation.ts` | `app/app-shell.jsx` |
| `Dashboard.tsx` | `app/growing-dashboard.jsx` |
| `Attendance.tsx` | `app/growing-attendance.jsx` |
| `MakeupManager.tsx` | `app/new-screens.jsx` (GrowingMakeup) |
| `Exams.tsx` / `Exams.css` | `app/new-screens.jsx` (GrowingExams) |
| `Payments.tsx` | `app/growing-payments.jsx` |
| `Students.tsx` | `app/growing-students.jsx` |
| `Classes.tsx` | `app/growing-classes.jsx` |
| `CounselLogs.tsx` | `app/growing-counsel.jsx` |
| `Messaging.tsx` | `app/growing-messaging.jsx` |
| `KakaoManager.tsx` | `app/new-screens.jsx` (GrowingKakao) |
| `DataQuality.tsx` | `app/new-screens.jsx` (GrowingDataQuality) |
| `AttendanceStats.tsx` | `app/growing-stats.jsx` |
| `Backup.tsx` (설정) | `app/growing-settings.jsx` |
| `Kiosk.tsx` | `app/growing-kiosk.jsx` (변경 없음) |
| 공통 CSS 토큰/클래스 | `app/system.css`(=정본), `app/additions.css`(새 화면·기능 CSS) |

> 사람이 보는 문서: `1. 디자인 점검 리포트.html`(진단), `3. 개발 반영 핸드오프.html`(이 README의 시각 버전). 실행 프로토타입: `2. 통일 프로토타입.html`(브라우저로 열면 됨, 빌드 불필요).

---

## 9. 반영 체크리스트

- [ ] `App.tsx` 데드코드(NAV_GROUPS·void·splice) 제거
- [ ] `navigation.ts` 3그룹 13항목 + 모바일 5탭으로 교체
- [ ] 데스크톱 서브탭/바로가기 칩 제거, 맥락 이동은 화면 본문 액션으로
- [ ] 탭·버튼·배지·인풋·모달을 정본 클래스로 일괄 치환, `alert()`→토스트
- [ ] 새 4화면(보강·평가·카카오·점검) `.gd` 흡수 + `@media(max-width:600px)` 분기
- [ ] 알림장 = 종합 1종 + 편집 가능 + 학생별 발송 대기
- [ ] 출결 개별 카톡/문자 제거(5컬럼), 설정 템플릿 1종, 상담 알림장 버튼 제거
- [ ] 아이비 플로팅 유지, 키오스크 현행 유지
- [ ] 태블릿 브레이크포인트 768→600, 시간표 모바일 풀-핏
- [ ] 새 기능 1·4·6 구현(자동응답 / 월간 리포트 / 정원·대기자)
- [ ] `Exams.css`를 토큰/.gd로 (기능 무변경), 레거시 CSS 삭제
- [ ] **데이터/로직 무변경 확인** (useAcademyData·api.ts·props 그대로)

---

## 10. Claude Code 시작 프롬프트 (복사해서 사용)

```
이 저장소의 design_handoff_growing_unify/README.md 를 읽고 그대로 적용해줘.
원칙: 데이터/저장 로직(useAcademyData, src/lib/api.ts, 컴포넌트 props·콜백)은 절대 바꾸지 말고,
마크업/클래스/내비게이션/명시된 기능 정리만 한다. 토큰은 src/index.css의 기존 --color-* / .gd-* 를 정본으로 쓴다.
app/*.jsx 파일은 디자인 레퍼런스이니 그대로 이식하지 말고 기존 React+TS 패턴으로 재구현해줘.

작업 순서: (1) navigation.ts + App.tsx 정리 → (2) 컴포넌트 어휘 통일 → (3) 새 4화면 흡수 +
(4) 확정 단순화(알림장 종합1종·출결 카톡제거·설정 템플릿·상담 버튼·아이비 유지·키오스크 유지) →
(5) 반응형(태블릿 600px·시간표 모바일) → (6) 새 기능 1·4·6 → (7) Exams 비주얼 통합 + 레거시 CSS 삭제.

각 단계마다 npm run verify 로 점검하고, 한 단계씩 커밋해줘.
```
