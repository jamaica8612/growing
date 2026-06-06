# Aligo 알림톡 API 연동 가이드

## 개요

그로잉영어 앱은 알림장 발송 화면에서 선택한 날짜의 **일일 종합알림장**을 Aligo 알림톡으로 보냅니다.

- 현재 앱 발송 타입: `custom`
- 필수 템플릿 Secret: `ALIGO_TPL_CUSTOM`
- 발송 경로: 프론트엔드 -> Supabase Edge Function `send-alimtalk` -> Aligo API -> 카카오 알림톡

등원/하원/과제 개별 템플릿은 확장용입니다. 지금 폰으로 확인할 일일 알림장 발송에는 `ALIGO_TPL_CUSTOM`이 먼저 필요합니다.

---

## Step 1. Aligo 계정 준비

Aligo 대시보드에서 다음 값을 확인합니다.

```text
ALIGO_USER_ID     사용자 ID
ALIGO_API_KEY     API Key
ALIGO_SENDER      등록된 발신번호
```

발신번호는 Aligo의 발신번호 관리에서 먼저 등록/검증되어 있어야 합니다.

---

## Step 2. 카카오 발신프로필 준비

카카오비즈니스 또는 Aligo 비즈니스톡 메뉴에서 그로잉영어 발신프로필을 생성하고 검수합니다.

검수 완료 후 발신프로필 키를 `ALIGO_SENDER_KEY`로 등록합니다.

```text
ALIGO_SENDER_KEY  카카오 발신프로필 키
```

---

## Step 3. 일일 종합알림장 템플릿 등록

현재 앱의 알림장 화면은 아래 형식과 맞는 `custom` 템플릿을 사용합니다.

```text
템플릿명: 일일 종합알림장
용도: 선택한 날짜의 출결/과제, 필요 시 보강/보충 기록 안내

[그로잉영어]
#{학생명} 학생의 #{날짜} 일일 종합알림장입니다.

출결: #{출결}
등원/하원: #{등원하원}
과제: #{과제}
보강/보충: #{보강보충}

확인 부탁드립니다.
감사합니다.
```

검수 완료 후 생성된 템플릿 코드를 `ALIGO_TPL_CUSTOM`에 넣습니다.

```text
ALIGO_TPL_CUSTOM  일일 종합알림장 템플릿 코드
```

---

## Step 4. Supabase Secrets 설정

```bash
cd /c/work/Growing

npx supabase secrets set ALIGO_USER_ID="[Aligo 사용자 ID]"
npx supabase secrets set ALIGO_API_KEY="[Aligo API Key]"
npx supabase secrets set ALIGO_SENDER_KEY="[카카오 발신프로필 키]"
npx supabase secrets set ALIGO_SENDER="[등록 발신번호]"
npx supabase secrets set ALIGO_TPL_CUSTOM="[일일 종합알림장 템플릿 코드]"

# 테스트 중에는 Y, 실제 발송 전에는 N
npx supabase secrets set ALIGO_TEST_MODE="Y"
npx supabase secrets set ALIGO_FAILOVER="N"
```

템플릿 검수 전에는 `ALIGO_TPL_CUSTOM`을 아직 넣을 수 없으므로, 실제 알림톡 발송 버튼을 누르면 `ALIGO_TPL_CUSTOM is not configured` 오류가 나는 것이 정상입니다.

---

## Step 5. Edge Function 배포

`send-alimtalk`를 수정했거나 Secrets를 새로 적용한 뒤 재배포가 필요하면 아래 명령을 사용합니다.

```bash
npx supabase functions deploy send-alimtalk --project-ref xrrdokcjhjqdfvwtbenl --use-api
```

---

## Step 6. 앱에서 테스트

1. 알림장 발송 화면으로 이동
2. 날짜 선택
3. 학생 선택 또는 반 단위 생성
4. 출결/과제는 기본 포함
5. 보강/보충은 해당 날짜 기록을 포함하고 싶을 때만 선택
6. 초안 생성
7. 알림톡 보내기

테스트 모드(`ALIGO_TEST_MODE=Y`)에서는 Aligo API 호출과 발송 로그 확인만 하고 실제 카카오톡 수신은 되지 않을 수 있습니다. 실제 발송 전에는 `ALIGO_TEST_MODE=N`으로 바꿉니다.

---

## 최종 체크리스트

```text
[ ] Aligo 계정/API Key 확인
[ ] 발신번호 등록 및 검증
[ ] 카카오 발신프로필 검수 완료
[ ] 일일 종합알림장 템플릿 검수 완료
[ ] ALIGO_TPL_CUSTOM 등록
[ ] ALIGO_TEST_MODE 값 확인
[ ] send-alimtalk Edge Function 배포
[ ] 앱 알림장 발송 화면에서 테스트
```

---

## 문제 해결

| 문제 | 원인 | 해결 |
| --- | --- | --- |
| `ALIGO_TPL_CUSTOM is not configured` | 일일 종합알림장 템플릿 코드 미등록 | 템플릿 검수 완료 후 Supabase Secret 등록 |
| 실제 발송 안 됨 | `ALIGO_TEST_MODE=Y` | 실제 발송 전 `N`으로 변경 |
| 연락처 오류 | 학생 학부모 연락처 누락/형식 오류 | 학생 정보에서 연락처 확인 |
| Aligo 발송 실패 | API Key, 발신프로필 키, 발신번호 불일치 | Step 1-4 값 재확인 |

작성일: 2026-06-02  
마지막 업데이트: 2026-06-07
