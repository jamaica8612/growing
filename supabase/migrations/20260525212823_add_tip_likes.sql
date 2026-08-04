
-- 팁 좋아요 테이블
CREATE TABLE IF NOT EXISTS public.rn_tip_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tip_id, created_by)
);

ALTER TABLE public.rn_tip_likes ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 읽기
CREATE POLICY "rn_read_likes_for_auth" ON public.rn_tip_likes
    FOR SELECT USING (auth.role() = 'authenticated');

-- 본인 좋아요만 등록/삭제
CREATE POLICY "rn_insert_own_like" ON public.rn_tip_likes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = created_by);

CREATE POLICY "rn_delete_own_like" ON public.rn_tip_likes
    FOR DELETE USING (auth.uid() = created_by);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_tip_likes;
EXCEPTION WHEN others THEN NULL;
END $$;
;
