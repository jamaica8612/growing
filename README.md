# Growing

그로잉영어 교습소 운영을 위한 React + Supabase 기반 관리 앱입니다. 학생, 반/시간표, 출결, 수납, 상담 기록, 알림장, 키오스크 흐름을 한 화면에서 관리하고, 오른쪽 하단의 AI 비서 아이비가 운영 데이터 조회와 학부모 안내문 초안 작성을 돕습니다.

## 주요 기능

- Supabase Auth 기반 로그인
- 학생 주소록과 재원/퇴원 관리
- 반/시간표 관리
- 출석, 결석, 보강 기록
- 월별 출결 통계
- 교육비 수납 및 미납 확인
- 상담/진도/시험 일지
- 등하원 키오스크와 알림 대기열
- AI 비서 아이비
  - 학생/반/출결/수납/상담/오늘 현황 조회
  - 미납 안내, 출결 후속 안내 등 학부모 메시지 초안 작성

## 실행

```bash
npm install
npm run dev
```

## 환경 변수

프론트엔드는 `.env`에 Supabase 프로젝트 정보를 사용합니다.

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

AI 비서 Edge Function은 Supabase 프로젝트 시크릿에 `GEMINI_API_KEY`가 필요합니다.

## 검증

```bash
npm run verify
```

아이비 AI 비서와 알림장 연결 기능의 배포 전 점검은 [Ivy Assistant QA Runbook](docs/assistant-qa.md)을 따릅니다.

## Supabase Edge Function 배포

Supabase CLI가 전역 설치되어 있지 않으면 `npx`로 실행할 수 있습니다.

```bash
npx supabase functions deploy assistant --project-ref <project-ref>
```

현재 프론트엔드는 `VITE_SUPABASE_URL/functions/v1/assistant`를 호출합니다.
