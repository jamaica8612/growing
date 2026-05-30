# Ivy Assistant QA Runbook

아이비 AI 비서와 알림장 연결 기능을 배포 전 점검하기 위한 운영 체크리스트입니다.

## Scope

이 체크리스트는 결제 API 연동 전 단계의 기능만 다룹니다.

- 아이비 채팅 위젯 표시와 기본 질의
- Supabase Edge Function `assistant` 인증/오류 처리
- 학생/반/출결/수납/상담 조회형 답변
- 학부모 안내문 초안 생성
- 아이비 답변 복사
- 아이비 초안을 알림장 조립기로 넘기기
- 초안에서 학생 이름이 정확히 하나 매칭될 때 대상 원생 자동 선택

실제 메시지 발송, 결제 API, 청구서 발행, 출결 변경은 이 범위에 포함하지 않습니다.

## Local Verification

```bash
npm run verify
```

예상 결과:

- ESLint 오류 없음
- TypeScript/Vite production build 성공
- Vite chunk size 경고는 현재 허용

로컬 앱 실행:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

브라우저에서 `http://localhost:5173/growing/` 또는 Vite가 안내하는 `/growing/` 경로를 연다.

## Edge Function Deployment Check

배포:

```bash
npx supabase functions deploy assistant --project-ref xrrdokcjhjqdfvwtbenl --use-api
```

인증 게이트 확인:

```powershell
$url='https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/assistant'
$key='<VITE_SUPABASE_ANON_KEY>'
Invoke-WebRequest -Uri $url -Method Post -Headers @{apikey=$key; 'Content-Type'='application/json'} -Body '{"messages":[{"role":"user","content":"오늘 출석 현황 알려줘"}]}'
```

로그인 토큰 없이 호출하면 `401`이 정상입니다.

## Manual E2E Flow

로그인 후 아래 순서로 확인합니다.

1. 오른쪽 하단 아이비 버튼을 연다.
2. `오늘 출석 현황 알려줘`를 보낸다.
3. 실제 데이터 기반 요약 또는 데이터 없음 안내가 표시되는지 확인한다.
4. `이번 달 미납 학부모에게 보낼 안내 문구 만들어줘`를 보낸다.
5. 답변 말풍선에 `초안`, `복사`, `알림장으로` 액션이 표시되는지 확인한다.
6. `복사`를 누르면 버튼이 `복사됨`으로 바뀌는지 확인한다.
7. `알림장으로`를 누른다.
8. 알림장 탭으로 이동하고, 아이비 초안이 미리보기 textarea에 들어가는지 확인한다.
9. 초안에 학생 이름이 정확히 하나 포함된 경우 대상 원생이 자동 선택되는지 확인한다.
10. 학생이 자동 선택되면 연락처 표시와 SMS 버튼 상태가 맞는지 확인한다.
11. 초안을 직접 수정하고 복사 버튼이 동작하는지 확인한다.

## Empty And Error States

- 학생 이름을 찾지 못한 상담/출결 질문은 이름 확인 안내가 나와야 한다.
- Gemini 과부하 또는 레이트리밋은 잠시 후 재시도 안내로 보여야 한다.
- `GEMINI_API_KEY`가 없으면 시크릿 설정 안내가 나와야 한다.
- 로그인 세션이 없으면 프론트에서 로그인 필요 오류가 나와야 한다.
- 연락처가 없는 학생은 SMS 버튼이 비활성화되어야 한다.

## Release Criteria

PR 전 최소 기준:

- `npm run verify` 통과
- Edge Function 배포 성공
- 인증 없는 Edge Function 호출이 `401` 반환
- 로그인 후 아이비 조회 질문 1개 성공
- 안내문 초안 생성 1개 성공
- 알림장으로 보내기 1회 성공
- 결제 API/실제 발송 관련 변경 없음

## Rollback

문제가 있으면 우선 프론트 배포를 직전 안정 버전으로 되돌립니다. Edge Function 문제만 있으면 이전 커밋의 `supabase/functions/assistant/index.ts`를 배포합니다.

```bash
npx supabase functions deploy assistant --project-ref xrrdokcjhjqdfvwtbenl --use-api
```
