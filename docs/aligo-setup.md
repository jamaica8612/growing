# 알리고 알림톡 연동 설정

알림톡 발송은 `send-alimtalk` Supabase Edge Function에서 처리한다. 프론트엔드에는 알리고 API 키를 두지 않는다.

## 필요한 알리고 준비물

- 알리고 사용자 ID
- 알리고 API Key
- 카카오 알림톡 발신프로필 키 `senderKey`
- 알리고에 등록된 발신번호
- 카카오 검수가 완료된 템플릿 코드

현재 알림장 화면의 `알림톡 보내기`는 `custom` 타입으로 발송한다. 따라서 등원/하원/과제 템플릿보다 먼저 아래 템플릿이 필요하다.

```text
템플릿명: 일일 종합알림장
용도: 선택한 날짜의 출결/과제, 필요 시 보강/보충 기록 안내
예시 내용:
[그로잉영어]
#{학생명} 학생의 일일 종합알림장입니다.

#{내용}
```

## Supabase Edge Function Secrets

아래 값은 Supabase Dashboard 또는 CLI로 Edge Function secret에 등록한다.

```bash
npx supabase secrets set ALIGO_USER_ID="알리고아이디"
npx supabase secrets set ALIGO_API_KEY="알리고API키"
npx supabase secrets set ALIGO_SENDER_KEY="발신프로필키"
npx supabase secrets set ALIGO_SENDER="등록발신번호"
```

템플릿 코드는 알림 종류별로 등록한다.

```bash
npx supabase secrets set ALIGO_TPL_CHECK_IN="등원템플릿코드"
npx supabase secrets set ALIGO_TPL_CHECK_OUT="하원템플릿코드"
npx supabase secrets set ALIGO_TPL_HOMEWORK_DONE="숙제완료템플릿코드"
npx supabase secrets set ALIGO_TPL_HOMEWORK_INCOMPLETE="숙제미흡템플릿코드"
npx supabase secrets set ALIGO_TPL_HOMEWORK_UNDONE="숙제안함템플릿코드"
npx supabase secrets set ALIGO_TPL_CUSTOM="일일종합알림장템플릿코드"
```

선택 설정:

```bash
npx supabase secrets set ALIGO_TEST_MODE="Y"
npx supabase secrets set ALIGO_FAILOVER="N"
```

`ALIGO_TEST_MODE`는 실제 발송 전 테스트에 사용한다. 실제 운영 전에는 `N`으로 바꾼다.
