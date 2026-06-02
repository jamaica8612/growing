# Handoff: 그로잉영어 UI 리디자인 (10개 화면)

> 대상 개발자(또는 Claude Code)에게: 이 문서 하나로 작업을 시작할 수 있도록 작성되었습니다.
> **이 번들의 `prototype/` 파일은 "프로덕션 코드"가 아니라 디자인 레퍼런스(HTML/인라인 JSX 프로토타입)** 입니다.
> 작업은 이 프로토타입의 룩앤필·구조·인터랙션을 **기존 `Growing` 코드베이스(React 19 + TypeScript + Vite + Supabase)** 의
> 기존 패턴(타입, props, `useAcademyData` 훅, `index.css`, `lucide-react`)에 맞춰 **재구현**하는 것입니다. HTML을 그대로 이식하지 마세요.

---

## 개요

`그로잉영어` 학원 운영 앱의 **10개 전 화면**을 동일한 **Forest & Cream** 톤으로 리디자인했습니다. 색/폰트(Outfit + Noto Sans KR)는 유지하되, 위계·여백·상태 표현·카드/그림자 시스템을 정제하고 몇 가지 새 UI 패턴(인사 히어로, 진행률 링, 세그먼트 컨트롤, 마스터-디테일 + 통합 타임라인, 카카오톡 말풍선 미리보기, 토스트)을 도입했습니다.

## 충실도(Fidelity)

**High-fidelity.** 최종 색/타이포/간격/인터랙션이 확정된 목업입니다. 픽셀 단위로 기존 라이브러리(React, lucide-react, `index.css`)로 재현하세요. 단, 데이터·저장 로직은 절대 새로 만들지 말고 **기존 `useAcademyData`/`api.ts`/props 흐름을 그대로 통과**시켜야 합니다.

## 가장 중요한 원칙 (먼저 읽기)

1. **데이터/상태 배선은 기존 그대로.** 프로토타입은 `window.GROWING_DATA` 목업과 로컬 `useState`로 동작합니다. 실제 코드에서는 각 컴포넌트의 **기존 props 시그니처와 `onSaveAttendance`/`onRecordPayment`/`onAddCounselLog` 등 콜백을 그대로 사용**하세요. `types/index.ts`, `lib/*.ts`(특히 `studentTags.ts`, `studentTimeline.ts`, `classSchedules.ts`, `classTuition.ts`, `messageTemplates.ts`, `billingPreview.ts`)는 **재사용**합니다 — 프로토타입의 `growing-students-lib.js`는 이 lib들을 모사한 것이므로 새로 만들지 마세요.
2. **리팩토링의 척추는 `src/index.css`.** 10개 화면이 모두 같은 토큰/컴포넌트 클래스를 공유합니다. 먼저 아래 *디자인 시스템* 절대로 `index.css`를 갱신하면 앱 전체가 즉시 새 룩으로 바뀝니다. 그 다음 화면별로 마크업을 옮기세요.
3. **토큰 이름은 기존 `--color-*` / `--radius-*` / `--shadow-*` 유지.** 프로토타입은 `--g-*`라는 별칭을 쓰지만, 실제 반영 시에는 **기존 토큰 이름의 값만 조정**하세요(아래 매핑 표). 새 토큰명을 도입하지 마세요.
4. **`alert()`/`window.confirm()` → 토스트 + 인라인 확인.** 프로토타입은 가벼운 토스트(`.gd-toast`)로 피드백합니다. 파괴적 동작(삭제/초기화)만 confirm 유지.
5. **모바일.** 모든 화면은 `@media (max-width: 768px)`에서 단일 컬럼 + 하단 탭/카드형으로 무너집니다. 프로토타입의 `.gd-mobile`/`@media` 규칙을 참고하세요. 기존 `docs/ui-issues.md`의 미해결 모바일 이슈(테이블 가로 오버플로 등)는 이번 리디자인의 카드/세그먼트 패턴으로 자연 해소됩니다.

---

## 디자인 시스템 (index.css 갱신)

### 1) 토큰 값 조정 — 기존 `:root` 변수의 **값만** 교체

| 기존 토큰 | 현재 값 | 새 값 | 비고 |
|---|---|---|---|
| `--color-border` | `#e5e7eb` | `#e8edea` | 살짝 녹빛 도는 중립 보더 |
| `--radius-sm` | `0.375rem` | `0.5rem` | |
| `--radius-md` | `0.75rem` | `0.85rem` | |
| `--radius-lg` | `1.25rem` | `1.25rem` (유지) | 카드 |
| `--shadow-sm` | (기존) | `0 1px 2px rgba(15,46,33,0.06)` | 녹색 그림자 |
| `--shadow-md` | (기존) | `0 6px 18px -8px rgba(15,46,33,0.18), 0 2px 6px -4px rgba(15,46,33,0.08)` | 더 부드럽고 깊게 |

색 팔레트(primary `#1b4b36`, primary-dark `#0f3023`, primary-light `#2c6f52`, mint `#10b981`, sage `#84cc16`, danger `#ef4444`, warning `#f59e0b`, info `#3b82f6`, sidebar `#0f2e21` 등)와 폰트(`Outfit, 'Noto Sans KR'`)는 **그대로 유지**합니다.

> 프로토타입 → 실제 토큰 매핑: `--g-primary`→`--color-primary`, `--g-primary-dark`→`--color-primary-dark`, `--g-mint`→`--color-accent-mint`, `--g-border`→`--color-border`, `--g-danger`→`--color-danger`, `--g-warn`→`--color-warning`, `--g-info`→`--color-info`, `--g-text`→`--color-text-primary`, `--g-text2`→`--color-text-secondary`, `--g-muted`→`--color-text-muted`, `--g-surface`→`--color-bg-surface`, `--g-bg`→`--color-bg-base`, `--g-r-*`→`--radius-*`, `--g-shadow*`→`--shadow-*`.

### 2) 재사용 컴포넌트 패턴 (새로 추가)

전체 `<style>`은 `prototype/Growing Dashboard.html`의 `<head>`에 있습니다. 클래스 prefix별로 나눠 가져오세요. 핵심 공용 패턴:

- **카드** `.gd-card` — `background: surface; border: 1px solid border; border-radius: 1.25rem; padding: 1.3rem; box-shadow: shadow-sm`. 기존 `.card`를 이 사양으로 정렬.
- **인사 히어로 밴드** `.gd-hero` — `linear-gradient(120deg,#103b2a,#1b5840 55%,#2c6f52)` 위 흰 텍스트 + 우상단 잎사귀 SVG(`opacity .07`). 대시보드 상단.
- **요약 타일** `.gd-stat` — 아이콘 칩(44×44, radius 12) + 라벨/값. 값은 `em`으로 단위 작게.
- **진행률 도넛 링** — SVG 2겹 `<circle>`, `stroke-dashoffset`로 채움, `transform: rotate(-90deg)`. 프로토타입 `growing-dashboard.jsx`의 `Ring` 컴포넌트 참고(React로 그대로 이식 가능).
- **세그먼트 컨트롤** `.gd-seg` / `.gd-seg-b` — 회색 트랙(`#eef2f0`, padding .2rem) 안에 균등 버튼, 선택 시 흰 배경 + 색 텍스트(`.sel.ok|.warn|.danger`). 출결/숙제/필터 전반에서 라디오 대체.
- **인라인 SVG 아이콘** — 프로토타입은 자체 `Icon` 맵을 쓰지만, **실제 코드는 기존 `lucide-react`를 사용**하세요(이미 의존성에 있음). 매핑: book→BookOpen, calendar→CalendarCheck/Calendar, card→CreditCard, msg→MessageSquare, bell→Bell, trend→TrendingUp, search→Search, checkCircle→CheckCircle2, refresh→RefreshCw, save→Save/Download, send→Send, trash→Trash2, users→Users, login→LogIn, logout→LogOut, clock→Clock, phone→Phone, plus→Plus, alert→AlertCircle.
- **토스트** `.gd-toast` — 화면 하단 중앙 알약, `position: fixed; bottom: 24px`. 복사/저장/완료 피드백.
- **배지/필터 칩** `.at-chip`(필터), `.pay-badge`/`.at-pill`(상태), `.st-tag`(주의 태그). severity색: danger=danger, warn=warning, info=info, ok=mint.

---

## 화면별 변경 지침 (프로토타입 ↔ 실제 파일 매핑)

각 항목: **대상 파일** / 프로토타입 레퍼런스 / 핵심 변경. 데이터·props는 기존 유지.

### ① 대시보드 — `src/components/Dashboard.tsx`
ref: `growing-dashboard.jsx`
- 상단 **인사 히어로 밴드**(날짜 칩 + "지선쌤, 좋은 아침이에요" + 한 줄 요약) 신설.
- **요약 타일 4개**: 오늘 수업 / 출결 진행(도넛 링, 체크 시 실시간 채움) / 오늘 보강 / 이번 달 미납.
- 기존 "오늘의 브리핑"은 색 점 리스트로 정제(`.gd-brief`).
- 본문 2단(`1.75fr / 1fr`): 좌 출결·숙제 체크(반별 → 학생 카드, 등원/하원 시각 스탬프 + 숙제 세그먼트), 우 미납 안내 도우미(복사 → 토스트).
- 콜백: `onSaveAttendance` 그대로. 등원/하원은 `checkInTime/checkOutTime`만 patch.

### ② 출결 관리 — `src/components/Attendance.tsx`
ref: `growing-attendance.jsx`
- 상단 필터 바(날짜 + 반 칩) + **일자 요약 스트립**(출석/지각/결석/보강/미체크 카운트).
- 기존 가로로 긴 7열 테이블 → **반별 그룹 + grid "데이터 행"**(학생 / 등·하원 / 출결 세그먼트 / 숙제 세그먼트 / 알림 / 메모). `docs/ui-issues.md` #4(모바일 테이블 오버플로) 해소.
- 모바일: 각 행이 라벨 달린 카드로 분해(`.gd-mobile .at-row`).
- 콜백: `onSaveAttendance`, `onQueueHomeworkAlert` 유지. 카톡/문자 액션은 기존 `messageTemplates`/`renderTemplate`·SMS 딥링크 로직 재사용.

### ③ 수납 관리 — `src/components/Payments.tsx`
ref: `growing-payments.jsx`
- 상단 2단: 좌 요약(예상 수납액 大 + 납부/미납/수납률 링), 우 **최근 5개월 매출 막대**(기존 `getHistoricalRevenue` 재사용; 프로토타입은 `revenueHistory` 목업).
- 장부: 검색 + 상태 세그먼트(전체/완납/미납) + grid 테이블(상태 배지, 수납 처리↔취소 토글, 삭제).
- 모달(수납 상세/개별 청구/일괄 생성 미리보기)은 **기존 것 유지** — 본 리디자인은 목록/요약 시각만 교체. `buildMonthlyBillingPreview` 등 유지.

### ④ 학생 관리·상세 — `src/components/Students.tsx` (+ `StudentTimeline.tsx`, `StudentTagBadges.tsx`)
ref: `growing-students.jsx` (+ `growing-students-lib.js` = 기존 `studentTags.ts`/`studentTimeline.ts` 모사)
- **마스터-디테일 레이아웃**(`0.85fr / 1.15fr`): 좌 학생 목록(아바타 + 태그 점 + 출석률), 우 상세.
- 기존 8탭 모달 → **인라인 상세 패널 + 4탭**(타임라인 / 기본 정보 / 출결·수납 / 상담 일지), 기본 탭 = **통합 타임라인**.
- 타임라인: `getStudentTimeline()`(기존 lib) 결과를 종류별 색 노드의 세로 타임라인으로. 태그: `getStudentTagMap()`(기존 lib) 재사용.
- 모바일: 목록 ↔ 상세 토글(뒤로 가기).
- 등록/수정 모달은 기존 유지 가능.

### ⑤ 반/시간표 — `src/components/Classes.tsx`
ref: `growing-classes.jsx`
- **주간 시간표 그리드**(월–금, 13–20시): 슬롯 `top%/height%`는 기존 `getMinutesFromStart`/`getDurationMinutes` 로직 그대로. `getSchedulesForDay` 재사용. 색은 `cls.color`.
- 반별 현황 요약(재원 인원 + 예상 수강료, `getStudentClassTuition` 재사용) + 운영 중 클래스 카드(시간표/원비/학생 칩, 휴원 표시).
- 클래스 추가/수정 모달은 기존 유지.

### ⑥ 상담/진도 일지 — `src/components/CounselLogs.tsx`
ref: `growing-counsel.jsx`
- 툴바(검색 + 유형 세그먼트 전체/상담/진도/평가, 건수 표시) + 내보내기/등록 버튼.
- 일지 카드: 유형별 좌측 색 보더 + 배지, 안내 복사(토스트)/알림장으로/삭제, 평가 점수 하이라이트.
- `buildParentMessage`·`onSendDraftToMessaging`·`handleExport`(md) 등 기존 로직 재사용.

### ⑦ 알림장 발송 — `src/components/Messaging.tsx`
ref: `growing-messaging.jsx`
- **발송 대기 큐**: `kioskAlerts` + `homeworkAlerts`를 한 리스트로(체크박스 다중선택, 등원/하원/숙제 배지, 필터 칩, 복사/알림톡/완료). 기존 `pendingRows` 구성·`sendAlimtalk`·`dismiss*` 콜백 유지.
- **조립기 + 미리보기**: 학생 select + 오늘 요약 + 6종 템플릿 + 파라미터. 미리보기는 **카카오톡 스타일 노란 말풍선**(`.msg-bubble`, 파란 배경). `compiledMessage`는 기존 `renderTemplate`/`messageTemplates` 사용.

### ⑧ 키오스크 — `src/components/Kiosk.tsx`
ref: `growing-kiosk.jsx`
- 다크 포레스트(`#0a2318`) 풀스크린: 헤더(로고 + 스피커 테스트 + 잠금) / 검색 / 학생 이름 카드 그리드 / 푸터.
- 카드 탭 → 등원·하원 확인 모달 → **성공 풀스크린 오버레이**(등원=mint, 하원=amber, 2.4s 후 자동 닫힘). 기존 `playSynthesizedChime`(Web Audio), `onSaveAttendance`, `onQueueAlert`, PIN 복귀(`handleExitSubmit`) **그대로 유지**.

### ⑨ 출결 통계 — `src/components/AttendanceStats.tsx`
ref: `growing-stats.jsx`
- 월 선택 + KPI 4(출석률/결석/보강/관리 필요) + 3개월 추세 막대 + 상태 분포 바 + 우선 관리 대상 + 학생별 출석률 표(낮은 순) + 반별 출석률 막대.
- 모든 집계(`totals`, `studentRows`, `trend`, `riskList`, 반별)는 **기존 계산 로직 그대로**. 출석률 = (출석+보강)/전체, 재원생 기준.

### ⑩ 설정(AI·알림·백업) — `src/components/Backup.tsx`
ref: `growing-settings.jsx`
- 섹션 카드 그룹: 백업/복원(2타일) · CSV 내보내기 · 키오스크 PIN · 아이비 기억(textarea+카운터) · 자가학습 메모(스코프 배지+삭제) · 알림 템플릿 편집(토큰 안내+기본값 되돌리기+저장) · 위험 영역.
- 기존 `api.getAssistantMemory/setAssistantMemory`, `listAssistantNotes/deleteAssistantNote`, `TEMPLATE_META`/`DEFAULT_TEMPLATES`, export/import/CSV/PIN 핸들러 **모두 유지**. 프로토타입은 토스트로 모킹했을 뿐.

---

## 인터랙션 & 상태 요약

- **즉시 자동 저장**: 출결/숙제 버튼은 누르는 즉시 반영(별도 저장 버튼 없음) — 기존 동작 유지, 시각 피드백만 추가.
- **복사 액션**: 클립보드 복사 후 1.6–2.4s 토스트 + 버튼 "복사됨" 상태.
- **진행률 링**: 체크 수/전체 변화 시 `stroke-dashoffset` `transition .6s cubic-bezier(.16,1,.3,1)`.
- **호버**: 카드 `translateY(-2~3px)` + shadow 상승, 버튼 색/보더 강조.
- **모바일 분기점**: 768px(레이아웃), 1024/1200px(그리드 컬럼 축소).

## 디자인 토큰 (요약)

- 색: primary `#1b4b36` / dark `#0f3023` / light `#2c6f52` / mint `#10b981` / sage `#84cc16` / danger `#ef4444` / warning `#f59e0b` / info `#3b82f6` / sidebar `#0f2e21` / bg `#f5f8f5` / surface `#fff` / border `#e8edea` / text `#1f2937` · `#4b5563` · `#9ca3af`.
- 반경: sm `.5rem` / md `.85rem` / lg `1.25rem` / full `9999px`.
- 그림자: sm `0 1px 2px rgba(15,46,33,.06)` / md `0 6px 18px -8px rgba(15,46,33,.18), 0 2px 6px -4px rgba(15,46,33,.08)`.
- 폰트: `'Outfit','Noto Sans KR',sans-serif`. 타이틀 800/letter-spacing -.02~-.03em.
- 간격: 카드 내부 `1.3rem`, 섹션 간 `1.15rem`, 타일 gap `.85rem`.

## 에셋

- 아이콘: 전량 **lucide-react**(기존 의존성)로 대체. 프로토타입의 인라인 SVG는 참고용.
- 이미지: 없음(잎사귀 모티프는 인라인 SVG). 별도 에셋 불필요.
- 폰트: Google Fonts(Outfit, Noto Sans KR) — 기존 로딩 방식 유지.

## 번들 파일 목록 (prototype/)

- `Growing Dashboard.html` — 10개 화면을 PC+모바일로 모은 캔버스. **전체 CSS가 이 파일 `<head>`에 있음**(디자인 시스템의 정본).
- `growing-data.js` — 목업 데이터(실제 반영 시 불필요, 스키마 참고용).
- `growing-students-lib.js` — 기존 `studentTags.ts`/`studentTimeline.ts` 모사(실제는 기존 lib 사용).
- `growing-{dashboard,attendance,payments,students,classes,counsel,messaging,kiosk,stats,settings}.jsx` — 화면별 레퍼런스 구현.
- `design-canvas.jsx`, `ios-frame.jsx` — 캔버스/디바이스 프레임(레퍼런스 실행용, 반영 대상 아님).

### 프로토타입 실행 방법
`Growing Dashboard.html`을 브라우저로 열면 됩니다(CDN React/Babel 사용, 빌드 불필요). 캔버스에서 각 아트보드 라벨을 클릭하면 전체화면으로 확대됩니다.
