-- 알림톡 메시지 로그 테이블
CREATE TABLE IF NOT EXISTS growing_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'alimtalk',
  provider TEXT NOT NULL DEFAULT 'aligo',
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  template_code TEXT,
  provider_message_id TEXT,
  provider_response JSONB,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, sent, failed
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE INDEX idx_growing_message_logs_student_id ON growing_message_logs(student_id);
CREATE INDEX idx_growing_message_logs_status ON growing_message_logs(status);
CREATE INDEX idx_growing_message_logs_created_at ON growing_message_logs(created_at DESC);

-- RLS 정책: 인증된 사용자만 조회 가능
ALTER TABLE growing_message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_own_logs ON growing_message_logs FOR SELECT
  USING (auth.role() = 'authenticated');
