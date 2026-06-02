# 리디자인 진행 현황

## 완료된 작업

### ① `src/index.css` — 디자인 시스템 갱신 ✅
- `:root` 토큰 값 조정 완료
  - `--color-border`: `#e5e7eb` → `#e8edea`
  - `--radius-sm`: `0.375rem` → `0.5rem`
  - `--radius-md`: `0.75rem` → `0.85rem`
  - `--shadow-sm`: 녹색 계열 그림자로 교체
  - `--shadow-md`: 더 부드럽고 깊은 녹색 그림자로 교체
- `.card` 사양 정렬: `padding 1.3rem`, `border: 1px solid var(--color-border)`, `box-shadow: shadow-sm`
- 새 디자인 시스템 클래스 전체 추가 (파일 끝 주석 섹션):
  - `gd-*` — 대시보드 전용 (hero, stats, brief, main, card, seg, io, toast...)
  - `at-*` — 출결 관리
  - `pay-*` — 수납 관리
  - `st-*` — 학생 관리 (마스터-디테일, 타임라인, 태그)
  - `cl-*` — 상담/진도 일지
  - `tt-*`, `cls-*` — 반/시간표
  - `msg-*` — 알림장 발송 (카카오톡 말풍선 포함)
  - `kk-*` — 키오스크
  - `stat-*` — 출결 통계
  - `set-*` — 설정

### ② `src/components/Dashboard.tsx` — 리디자인 반영 ✅
- `Ring` 컴포넌트 추가 (SVG 도넛 진행률)
- 인사 히어로 밴드 (`.gd-hero`) — 그라디언트 배경, 잎사귀 SVG, 날짜 칩, 인사말, 날짜 선택
- 요약 타일 4개 (`.gd-stats`) — 오늘 수업 / 출결 진행(Ring) / 오늘 보강 / 이번 달 미납
- 브리핑 색점 리스트 (`.gd-brief`)
- 본문 `1.75fr / 1fr` 그리드 (`.gd-main`)
- 반별 컬러 바 + 학생 카드 (`.gd-st`) — 등원/하원 버튼 + 숙제 세그먼트 컨트롤
- 미납 안내 도우미 — `gd-copy` 버튼, `gd-pay-item` 카드
- 토스트 알림 (`.gd-toast`) — 복사 후 2.4초 표시
- **기존 props 시그니처 & 콜백 (`onSaveAttendance`) 완전 유지**

---

## 남은 화면 (② ~ ⑩)

각 화면의 대상 파일과 주요 변경사항:

| # | 화면 | 파일 | 핵심 변경 | 사용 클래스 |
|---|------|------|-----------|------------|
| ② | 출결 관리 | `Attendance.tsx` | 필터바 + 일자 요약 스트립 + 반별 그리드 행 | `at-*`, `gd-seg` |
| ③ | 수납 관리 | `Payments.tsx` | 상단 요약(예상수납액 大 + 링) + 매출 막대 | `pay-*`, `gd-seg` |
| ④ | 학생 관리 | `Students.tsx` | 마스터-디테일 레이아웃 + 통합 타임라인 | `st-*` |
| ⑤ | 반/시간표 | `Classes.tsx` | 주간 시간표 그리드 + 반별 현황 카드 | `tt-*`, `cls-*` |
| ⑥ | 상담/진도 | `CounselLogs.tsx` | 툴바 + 유형별 좌측 색 보더 카드 | `cl-*`, `gd-seg` |
| ⑦ | 알림장 | `Messaging.tsx` | 발송 큐 + 카카오톡 말풍선 미리보기 | `msg-*` |
| ⑧ | 키오스크 | `Kiosk.tsx` | 다크 포레스트 풀스크린 + 성공 오버레이 | `kk-*` |
| ⑨ | 출결 통계 | `AttendanceStats.tsx` | KPI 타일 + 추세 막대 + 분포 바 | `stat-*` |
| ⑩ | 설정 | `Backup.tsx` | 섹션 카드 + 위험 영역 | `set-*` |

## 작업 방법

```
# 각 화면 작업 순서
1. prototype/ 아래 해당 .jsx 파일 참고 (Growing Dashboard.html로 미리보기 가능)
2. 기존 컴포넌트 파일 읽고 props/콜백 확인
3. 마크업을 gd-* / at-* / pay-* 등 클래스로 교체 (데이터 로직은 절대 변경 금지)
4. npx tsc --noEmit 으로 타입 오류 없는지 확인
```

## 토큰 매핑 요약

프로토타입 `--g-*` → 실제 `--color-*`:
- `--g-primary` → `--color-primary`
- `--g-mint` → `--color-accent-mint`
- `--g-border` → `--color-border`
- `--g-danger` → `--color-danger`
- `--g-warn` → `--color-warning`
- `--g-info` → `--color-info`
- `--g-text` → `--color-text-primary`
- `--g-text2` → `--color-text-secondary`
- `--g-muted` → `--color-text-muted`
- `--g-surface` → `--color-bg-surface`
- `--g-r-sm` → `--radius-sm`
- `--g-r-md` → `--radius-md`
- `--g-r-lg` → `--radius-lg`
- `--g-shadow-sm` → `--shadow-sm`
- `--g-shadow` → `--shadow-md`
