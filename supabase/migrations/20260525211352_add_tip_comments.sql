
-- 팁 댓글 테이블
CREATE TABLE IF NOT EXISTS public.rn_tip_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- RLS 활성화
ALTER TABLE public.rn_tip_comments ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 읽기
CREATE POLICY "rn_read_comments_for_auth" ON public.rn_tip_comments
    FOR SELECT USING (auth.role() = 'authenticated');

-- 인증된 사용자 댓글 등록
CREATE POLICY "rn_insert_comments_for_auth" ON public.rn_tip_comments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 본인 또는 admin만 수정 (소프트 삭제용)
CREATE POLICY "rn_update_own_comment" ON public.rn_tip_comments
    FOR UPDATE USING (auth.uid() = created_by OR public.rn_is_admin(auth.uid()));

-- Realtime 구독 활성화
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_tip_comments;
EXCEPTION WHEN others THEN NULL;
END $$;
;
