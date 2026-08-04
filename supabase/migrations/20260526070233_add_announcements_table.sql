
CREATE TABLE IF NOT EXISTS public.rn_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rn_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_announcements_for_auth" ON public.rn_announcements
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "rn_write_announcements_for_admin" ON public.rn_announcements
    FOR ALL USING (public.rn_is_admin(auth.uid()));
;
