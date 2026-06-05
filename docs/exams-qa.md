# 평가 관리 QA 체크리스트

## 현재 범위

- 샘플형 온라인 시험 화면을 유지한다.
- 자료 입력은 텍스트 붙여넣기만 사용한다.
- PDF, HWP, 이미지 OCR 업로드는 아직 구현하지 않는다.
- 결과 안내는 수동 복사 또는 수동 메시징 이동만 허용한다.
- 알림톡 자동 발송은 넣지 않는다.

## 로컬/빌드 확인

- `npm run verify` 통과
- Codex UI가 버벅이면 `npm run verify:quiet`를 사용한다.
  - 성공 시 `verify:ok`만 출력
  - 실패 시 임시 로그의 마지막 80줄만 출력
  - 중단 시 Windows npm 자식 프로세스 트리를 정리
- 평가 관리 탭이 `Exams` 화면으로 열린다.
- 공개 응시 라우트 `#/exam/{code}`가 로그인 없이 열린다.
- 공개 결과 라우트 `#/exam-result/{token}`가 로그인 없이 열린다.
- 배포 화면 QR은 실제 QR 이미지이며 `#/exam/{code}` 링크를 담는다.
- 문항이 0개인 시험은 공개 응시/제출 전에 오류로 막힌다.
- `npm run smoke:exam-public` 통과
- `npm run smoke:exam-e2e` 통과

## 실 DB 확인

- 텍스트 자료로 시험 생성
- 저장된 시험을 다시 열어 문항/메타데이터 수정 후 저장
- 응시 진행 중인 시험은 마감 전 수정 저장이 막히는지 확인
- 제출 답안이 있는 시험은 수정 저장이 막히는지 확인
- 시험 저장 후 배포 화면 진입
- 시험 상태를 응시중으로 전환
- 공개 응시 링크에서 학생 1명 제출
- 학생 제출 버튼은 저장 중 중복 클릭되지 않음
- 배포 화면 제출 현황이 주기 갱신으로 반영
- 배포 화면 `현황 새로고침` 버튼으로 제출 현황을 수동 갱신할 수 있음
- 결과 화면 진입 시 `examsApi.submissions(examId)` 결과가 표시
- 결과 화면 `결과 새로고침` 버튼으로 제출 결과를 수동 갱신할 수 있음
- 제출이 0건일 때 결과/학부모 안내 화면이 오류 없이 빈 상태 표시
- 답안 일부가 누락되어도 결과 상세/학부모 결과 화면이 오류 없이 미응답으로 표시
- 학부모 안내문 복사 시 `#/exam-result/{token}` 링크 포함
- 메시징으로 이동 시 메시징 탭에 안내문 초안만 채워지고 자동 발송되지 않음
- 공개 응시 학생 명단은 시험 반의 `student_ids` 순서와 owner 기준을 따른다.
- 공개 결과 링크는 token, owner, exam, submission이 모두 일치할 때만 열린다.
- 객관식 미응답은 ①번으로 오채점되지 않는다.
- E2E smoke는 `CodexE2E` 임시 학생/반/시험/상담 로그를 생성 후 cleanup한다.

## 배포 전 확인

- Supabase migration `20260604170000_online_exams.sql` 적용
- `npx supabase migration list --linked` 기준, 다른 pending migration이 함께 있으면 `db push`를 바로 실행하지 말고 적용 범위를 먼저 확정
- Edge Function `exam-generate` 배포
- Edge Function `exam-public`은 공개 응시/결과용이므로 `--no-verify-jwt`로 배포
- 함수 재배포는 `npm run deploy:exam-functions` 사용
- publishable key로 `exam-public` 호출 시 401이 아니라 시험 없음/토큰 없음 오류가 반환되는지 확인
- `SUPABASE_URL` 설정
- `SUPABASE_ANON_KEY` 설정
- `GEMINI_API_KEY` 설정
- `SUPABASE_SERVICE_ROLE_KEY` 설정

## 2026-06-05 원격 상태 메모

- 원격 DB에는 `growing_exam_*` 테이블, RLS, owner 정책, `exam_result` 메시지 로그 제약이 이미 존재한다.
- 전체 `db push`는 로컬 pending migration 여러 개를 함께 적용할 수 있어 보류했다.
- 온라인 시험용 보조 인덱스 2개는 원격에 단독 적용했다.
  - `idx_growing_exam_submissions_exam_status`
  - `idx_growing_exam_result_links_owner_exam_submission`
- `exam-public`은 `--no-verify-jwt`로 재배포했고 publishable key smoke를 통과했다.
- `exam-generate`는 현재 코드로 재배포했다.
- `npm run smoke:exam-e2e`로 실제 공개 제출, 교사 제출 조회, 학부모 결과 조회, cleanup까지 확인했다.
