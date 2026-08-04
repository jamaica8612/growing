
-- 알림 테이블
CREATE TABLE IF NOT EXISTS public.rn_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.rn_profiles(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('mention')),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.rn_tip_comments(id) ON DELETE SET NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rn_notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림만 읽기
CREATE POLICY "rn_read_own_notifications" ON public.rn_notifications
    FOR SELECT USING (auth.uid() = recipient_id);

-- 인증 사용자는 알림 생성 가능 (멘션 등록)
CREATE POLICY "rn_insert_notifications_for_auth" ON public.rn_notifications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 본인 알림만 읽음 처리
CREATE POLICY "rn_update_own_notifications" ON public.rn_notifications
    FOR UPDATE USING (auth.uid() = recipient_id);

-- Realtime 활성화
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_notifications;
EXCEPTION WHEN others THEN NULL;
END $$;
;
