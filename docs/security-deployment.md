# 보안 강화 배포 체크리스트

이번 변경은 기존 학원 운영 기능을 유지하면서 Edge Function 호출 경계와 공개 시험 본인 확인을 강화한다. 공개 시험 응시자에게만 이름 선택 뒤 연락처 마지막 4자리 확인 단계가 추가된다.

## 1. 배포 전 Secret 등록

서로 다른 무작위 값(각 32바이트 이상)을 Supabase 프로젝트 Secret으로 먼저 등록한다. 실제 값은 저장소, 문서, GitHub Secret에 기록하지 않는다.

```powershell
npx supabase secrets set PUSH_INTERNAL_SECRET="<무작위 32바이트 이상 값>" EXAM_VERIFICATION_SECRET="<별도의 무작위 32바이트 이상 값>" --project-ref xrrdokcjhjqdfvwtbenl
```

- `PUSH_INTERNAL_SECRET`: `kakao-skill`과 `send-push` 사이의 HMAC 서명에 사용한다.
- `EXAM_VERIFICATION_SECRET`: 공개 시험 학생 키와 1시간짜리 제출 검증 토큰에 사용한다.
- 값이 없거나 너무 짧으면 두 기능은 안전하게 요청을 거부한다.

## 2. 배포 순서

Secret 등록을 확인한 뒤 아래 순서로 배포한다.

1. `kakao-skill --no-verify-jwt`
2. `send-push --no-verify-jwt`
3. `send-alimtalk` (JWT 검증 유지)
4. `exam-public --no-verify-jwt` (함수 내부 HMAC 및 연락처 검증)
5. `exam-generate` (JWT 검증 유지)

`main` 브랜치 배포는 `.github/workflows/deploy.yml`이 Edge Function workflow를 먼저 호출하고, 성공한 뒤에만 GitHub Pages를 배포한다. 따라서 새 프런트엔드가 구 Edge API보다 먼저 공개되는 계약 불일치를 막는다.

## 3. 데이터베이스 주의 사항

연결된 운영 DB와 로컬 migration 이력이 현재 서로 다르므로 이력을 먼저 조정하기 전에는 `supabase db push`를 실행하지 않는다.

```powershell
npm run check:migration-drift
```

이 명령이 실패하면 의도된 보호 동작이다. 운영 DB 변경이 필요한 경우 현재 운영 스키마를 별도로 백업하고 migration 이력을 먼저 대조한다.

## 4. 배포 후 확인

- 카카오 상담 요청이 원장님 기기에 푸시되는지 확인한다.
- 알림톡 단일 발송과 일괄 발송이 저장된 학생 보호자 연락처로만 전송되는지 확인한다.
- 공개 시험 코드로 진입했을 때 UUID, 전체 이름, 제출 상태가 노출되지 않는지 확인한다.
- 연락처 마지막 4자리가 틀리면 응시가 시작되지 않고, 맞으면 제출되는지 확인한다.
- `npm run verify`, `npm run audit:security`, 공개 시험 smoke test를 통과시킨다.
