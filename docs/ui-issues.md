# PC/모바일 UI 이슈 점검 결과

> 점검일: 2026-05-31 | 점검 범위: index.css, Dashboard/Attendance/Messaging/Classes/Students.tsx

---

## 🔴 우선순위 높음

| # | 파일 | 위치 | 문제 | 상태 |
|---|------|------|------|------|
| 1 | `Classes.tsx` | modal-content | `maxWidth: 600px` 고정 → 모바일(375px)에서 모달이 화면 밖으로 넘침 | ✅ 수정됨 |
| 2 | `index.css` | `.btn-att-select` L1216 | `min-height: 30px` → 터치 타겟 최소 44px 미달 | ✅ 수정됨 |
| 3 | `index.css` | `.class-slot-name` L830 | `white-space: nowrap` + body `word-break: keep-all` 충돌 → 한국어 클래스명 PC에서 잘림 | ✅ 수정됨 |
| 4 | `Attendance.tsx` | L324-558 desktop table | `table-wrapper`(overflow-x: auto) 미적용 → 모바일에서 테이블 가로 오버플로우 | 미수정 |
| 5 | `Dashboard.tsx` | L266-342 quick-att-card | time input 2열 + 숙제버튼 3개 한 행 → 작은 화면에서 찌그러짐 | 미수정 |

---

## 🟡 우선순위 중간

| # | 파일 | 위치 | 문제 | 상태 |
|---|------|------|------|------|
| 6 | `index.css` | timetable-time-col L494 | `font-size: 0.62rem` (~9.9px) → 가독성 부족 | ✅ 수정됨 |
| 7 | `index.css` | `.card` L523 | `padding: 1.5rem` PC값 모바일 미축소 | ✅ 수정됨 |
| 8 | `Messaging.tsx` | textarea L655 | `rows={12}` 고정 → 모바일에서 textarea가 화면을 과도하게 차지 | ✅ 수정됨 |
| 9 | `Messaging.tsx` | 템플릿 버튼 L534 | 2열 그리드 → 모바일에서 버튼이 작아짐 | 미수정 |
| 10 | `index.css` | 미디어쿼리 L1627 | `@media (max-width: 1024px)` 순서가 768px 뒤에 위치 (비논리적) — 해당 1024px 블록은 base styles(L1525) 이후에 위치해야 하므로 기능상 정상. 구조적 개선 필요 시 별도 리팩터링 필요. | 기능상 무해, 보류 |
| 11 | `Attendance.tsx` | L730-777 월간 리포트 | 6컬럼 테이블 모바일 미대응 | 미수정 |

---

## 🟢 우선순위 낮음

| # | 파일 | 위치 | 문제 | 상태 |
|---|------|------|------|------|
| 12 | `index.css` | `.tabs-header` / `.tab-btn` L1645-1658 | 규칙 중복 정의 | 미수정 |
| 13 | `index.css` | `.modal-content` L964 vs L1865 | `width: 90%` / `width: 95%!important` 중복 | 미수정 |
| 14 | `index.css` | `.notice-text-box` L1479 | `white-space: pre-wrap` + `word-break: break-all` 상충 | 미수정 |
| 15 | `Dashboard.tsx` | L365-413 미납 카드 | flex 레이아웃 모바일 줄바꿈 미처리 | ✅ 수정됨 |
| 16 | `Students.tsx` | 상세 모달 탭 | 다중 탭(9개) 모바일 수평 스크롤 필요 여부 미확인 | ✅ `.st-tabs` overflow-x:auto 이미 적용됨 |

---

## 개선 적용 내역 (이번 PR)

- `Classes.tsx` 모달 maxWidth → `min(600px, calc(100vw - 1.5rem))`
- `index.css` `.btn-att-select` min-height 30px → 44px
- `index.css` `.class-slot-name` PC에서도 `white-space: normal` 허용
- `index.css` 모바일 `.timetable-time-col` font-size 0.62rem → 0.68rem
- `index.css` 모바일 `.card` padding 1.5rem → 1rem
- `Messaging.tsx` textarea rows 12 → 8 (모바일 영역 절약)
