# 🔔 Aligo 알림톡 API 연동 완벽 가이드

## 개요

그로잉영어 앱에서 **카카오톡 알림톡**을 통해 학부모님께 실시간 알림을 보냅니다.
- 등원/하원 안내
- 숙제 완료/미흡/미제출 알림
- 결제 안내 (확장 예정)

**아키텍처**: 프론트엔드 → Supabase Edge Function → Aligo API → 카카오톡

---

## 📋 Step 1: Aligo 계정 준비 (5분)

### 1.1 Aligo 가입

1. [Aligo 공식사이트](https://www.aligo.in/) 접속
2. **회원가입** (휴대폰 인증 필수)
3. **대시보드** 접속

### 1.2 필수 정보 수집

대시보드에서 다음을 확인하고 기록:

```
□ 사용자 ID: _____________________
□ API Key: _____________________
□ 발신번호: _____________________ (미리 등록필요)
```

**발신번호 등록 방법:**
- 대시보드 → **발신번호 관리** → 해당 번호 추가/검증
- 일반 휴대폰 번호 또는 비즈니스 번호 가능

---

## 📲 Step 2: 카카오 비즈니스 계정 연동 (20분)

### 2.1 카카오 발신프로필 생성

1. [카카오비즈니스](https://business.kakao.com/) 접속
2. **메시지** → **알림톡** → **발신프로필**
3. **+ 발신프로필 추가**
4. 기관명: "그로잉영어" (또는 학원명)
5. 검증 완료 대기 (1-2시간)

### 2.2 발신프로필 키 생성

검증 완료 후:

1. **발신프로필 관리** → 생성된 프로필 선택
2. **프로필 정보** → **API Key** (발신프로필 키)
3. 복사: `ALIGO_SENDER_KEY`

```
□ 발신프로필 키 (senderKey): _____________________
```

---

## 🎯 Step 3: 알림톡 템플릿 등록 (30분)

### 3.1 템플릿 생성 (5가지)

카카오비즈니스 → **메시지** → **알림톡** → **템플릿**

**① 등원 안내 (check_in)**
```
제목: 등원 알림
내용:
[그로잉영어]
#{학생명} 학생이 등원했습니다.
시간: #{시간}
```

**② 하원 안내 (check_out)**
```
제목: 하원 알림
내용:
[그로잉영어]
#{학생명} 학생이 하원했습니다.
시간: #{시간}
```

**③ 숙제 완료 (homework_done)**
```
제목: 숙제 완료
내용:
[그로잉영어]
#{학생명} 학생이 숙제를 완료했습니다. ✓
```

**④ 숙제 미흡 (homework_incomplete)**
```
제목: 숙제 피드백
내용:
[그로잉영어]
#{학생명} 학생의 숙제 일부가 미흡합니다.
다시 확인하고 제출해 주세요.
```

**⑤ 숙제 미제출 (homework_undone)**
```
제목: 숙제 미제출
내용:
[그로잉영어]
#{학생명} 학생의 숙제가 아직 미제출입니다.
빠른 시일 내 제출 부탁드립니다.
```

### 3.2 템플릿 검수 신청

각 템플릿 → **검수 신청** → 1-2시간 대기

✅ 검수 완료되면 **템플릿 코드** 생성

```
□ 등원 (CHECK_IN): _____________________
□ 하원 (CHECK_OUT): _____________________
□ 숙제완료 (HOMEWORK_DONE): _____________________
□ 숙제미흡 (HOMEWORK_INCOMPLETE): _____________________
□ 숙제미제출 (HOMEWORK_UNDONE): _____________________
```

---

## 🔐 Step 4: Supabase Secrets 설정 (5분)

### 4.1 로컬 개발 환경

```bash
cd /c/work/Growing

# 기본 설정 (필수)
npx supabase secrets set ALIGO_USER_ID="[Step 1에서 복사]"
npx supabase secrets set ALIGO_API_KEY="[Step 1에서 복사]"
npx supabase secrets set ALIGO_SENDER_KEY="[Step 2에서 복사]"
npx supabase secrets set ALIGO_SENDER="[Step 1에서 복사한 발신번호]"

# 템플릿 코드 설정 (필수)
npx supabase secrets set ALIGO_TPL_CHECK_IN="[Step 3에서 복사]"
npx supabase secrets set ALIGO_TPL_CHECK_OUT="[Step 3에서 복사]"
npx supabase secrets set ALIGO_TPL_HOMEWORK_DONE="[Step 3에서 복사]"
npx supabase secrets set ALIGO_TPL_HOMEWORK_INCOMPLETE="[Step 3에서 복사]"
npx supabase secrets set ALIGO_TPL_HOMEWORK_UNDONE="[Step 3에서 복사]"

# 테스트 모드 (선택) - 실제 발송 전에 반드시 "N"으로 변경
npx supabase secrets set ALIGO_TEST_MODE="Y"
npx supabase secrets set ALIGO_FAILOVER="N"
```

### 4.2 프로덕션 환경

[Supabase Dashboard](https://supabase.com/) → **프로젝트** → **Settings** → **Edge Functions** → **Secrets**

위와 동일하게 설정

⚠️ **주의**: `ALIGO_TEST_MODE="N"` (실제 발송)

---

## 💾 Step 5: 데이터베이스 마이그레이션 (2분)

### 5.1 마이그레이션 적용

```bash
cd /c/work/Growing

# 로컬 Supabase
supabase db push

# 또는 Supabase Dashboard에서 SQL 실행
# supabase/migrations/20260602_alimtalk_message_logs.sql 내용 복사 후 실행
```

**테이블**: `growing_message_logs`
- 모든 알림톡 발송 기록 저장
- 상태: queued, sent, failed
- Provider 응답 로깅

---

## 🧪 Step 6: 테스트 (5분)

### 6.1 로컬 테스트

```bash
npm run dev
```

**Messaging 화면 → 알림톡 발송 테스트:**

1. 학생 선택
2. 템플릿 선택 (예: "등원 완료 🌱")
3. 메시지 작성
4. **"알림톡 발송"** 클릭

**예상 결과:**
- ✅ 메시지 로그에 **발송됨** 상태
- ✅ 학부모 휴대폰에 카카오톡 알림톡 수신
- ❌ 테스트 모드면 로그만 기록 (실제 발송 X)

### 6.2 에러 처리 확인

발송 실패 시나리오:
- 잘못된 연락처 → "학부모 연락처가 없어 알림톡을 보낼 수 없습니다"
- 네트워크 오류 → "알림톡 발송에 실패했습니다"
- API 오류 → Aligo 제공 에러 메시지

---

## ✅ 최종 체크리스트

배포 전에 다음을 확인:

```
□ Aligo 계정 가입 완료
□ 발신번호 등록 및 검증 완료
□ 카카오 발신프로필 검증 완료
□ 5개 알림톡 템플릿 검수 완료
□ Supabase Secrets 설정 완료
□ 데이터베이스 마이그레이션 완료
□ 로컬 테스트 성공
□ ALIGO_TEST_MODE = "N" (프로덕션)
□ Edge Function 배포 완료
```

---

## 🆘 문제 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| "학부모 연락처가 없어..." | 학부모 연락처 미입력 | Students에서 연락처 추가 |
| "알리고 발송 실패" | Secrets 미설정 | Step 4 다시 확인 |
| 실제 발송 안 됨 | ALIGO_TEST_MODE="Y" | "N"으로 변경 |
| 템플릿 검수 오래 걸림 | 카카오 대기 중 | 1-2시간 더 대기 |

---

## 📞 지원

- **Aligo 고객지원**: support@aligo.in
- **카카오비즈니스 지원**: [support.kakao.com](https://support.kakao.com)

---

**작성일**: 2026-06-02  
**마지막 업데이트**: 배포 후 실제 발송 테스트 완료 후 갱신 예정
