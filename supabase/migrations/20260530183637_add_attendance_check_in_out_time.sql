-- 등원/하원 시각을 정식 컬럼으로 분리 (통계/월말 리포트 집계 용이)
ALTER TABLE growing_attendance
  ADD COLUMN IF NOT EXISTS check_in_time text,
  ADD COLUMN IF NOT EXISTS check_out_time text;

-- 기존 memo에 "등원: HH:MM / 하원: HH:MM" 형식으로 저장된 값을 백필
UPDATE growing_attendance
SET check_in_time = substring(memo from '등원:\s*(\d{2}:\d{2})')
WHERE check_in_time IS NULL AND memo ~ '등원:\s*\d{2}:\d{2}';

UPDATE growing_attendance
SET check_out_time = substring(memo from '하원:\s*(\d{2}:\d{2})')
WHERE check_out_time IS NULL AND memo ~ '하원:\s*\d{2}:\d{2}';;
