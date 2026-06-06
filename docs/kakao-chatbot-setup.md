# 카카오 채널봇 구축 메모

그로잉영어 카카오 챗봇은 새 서버를 만들지 않고 Supabase Edge Function을 스킬 서버로 사용한다.

## 1. 앱에서 채널 설정

앱의 `카카오 관리` 화면에서 아래 값을 만든 뒤 저장한다.

- 채널명
- Skill secret
- Event secret
- 이 채널 사용: 켜기

저장 후 복사할 수 있는 URL은 두 종류다.

- 헤더 방식: 카카오 관리자에서 커스텀 헤더를 넣을 수 있을 때 사용
- secret 포함 URL: 헤더 입력이 어렵거나 지원되지 않을 때 사용

## 2. 카카오 관리자에 등록할 URL

Skill URL 기본형:

```text
https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/kakao-skill
```

Event URL 기본형:

```text
https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/kakao-channel-event
```

헤더를 넣을 수 있으면 아래 헤더를 등록한다.

```text
x-kakao-skill-secret: 앱에서 생성한 Skill secret
x-kakao-event-secret: 앱에서 생성한 Event secret
```

헤더를 넣을 수 없으면 앱에서 복사한 secret 포함 URL을 사용한다.

```text
https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/kakao-skill?secret=...
https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/kakao-channel-event?secret=...
```

## 3. 챗봇 블록 구성

처음에는 자유 대화보다 버튼형 업무 챗봇으로 운영한다.

### 시작/메뉴

대표 발화:

```text
시작
메뉴
안녕하세요
문의
```

응답:

```text
원하시는 메뉴를 선택해 주세요.
```

빠른 답장:

- 학생 연결
- 오늘 출결 확인
- 숙제 확인
- 상담 요청

### 학생 연결

대표 발화:

```text
학생 연결
연결
김서윤 1234
```

파라미터가 있으면:

- `studentName`
- `phone`

학부모 입력 예시:

```text
김서윤 1234
```

설명:

- 학생 이름과 보호자 휴대폰 뒤 4자리가 DB와 맞으면 카카오 사용자와 학생을 연결한다.
- 연결 전에는 출결/숙제/상담 요청을 처리하지 않는다.

### 오늘 출결 확인

대표 발화:

```text
오늘 출결
출결 확인
등원했나요
하원했나요
```

스킬 액션:

```text
attendance_today
```

응답 예시:

```text
김서윤 학생의 오늘 출결은 출석입니다.
등원: 14:00
하원: 16:00
```

### 숙제 확인

대표 발화:

```text
숙제 확인
오늘 숙제
과제 했나요
```

스킬 액션:

```text
homework_today
```

응답 예시:

```text
김서윤 학생의 오늘 숙제 상태는 완료입니다.
```

### 상담 요청

대표 발화:

```text
상담 요청
상담하고 싶어요
선생님께 문의
```

스킬 액션:

```text
counsel_request
```

응답 예시:

```text
김서윤 학생 상담 요청이 접수되었습니다.
원장님이 확인 후 연락드리겠습니다.
```

## 4. 테스트 순서

1. 카카오 관리 화면에서 secret 생성 및 저장
2. 카카오 챗봇 관리자에 Skill URL 등록
3. 연결 전 상태에서 `오늘 출결` 입력 -> 학생 연결 안내가 나오는지 확인
4. `학생명 1234` 입력 -> 연결 성공 확인
5. `오늘 출결`, `숙제 확인`, `상담 요청` 각각 테스트
6. 앱의 카카오 관리 화면에서 최근 요청 로그와 상담 요청 큐 확인

## 5. 운영 원칙

- 학부모용 챗봇은 처음에는 정해진 업무 메뉴만 제공한다.
- 자유 AI 답변은 나중에 추가하되, 원장 승인 또는 제한된 FAQ 범위 안에서만 사용한다.
- 학생 연결은 보호자 전화번호 뒤 4자리 검증을 유지한다.
