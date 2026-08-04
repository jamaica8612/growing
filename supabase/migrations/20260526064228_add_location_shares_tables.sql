
-- 1. rn_location_shares (1:1 sharing relationships)
CREATE TABLE IF NOT EXISTS public.rn_location_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.rn_profiles(id) ON DELETE CASCADE NOT NULL,
    recipient_id UUID REFERENCES public.rn_profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'ended')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicate active shares in either direction
CREATE UNIQUE INDEX rn_location_shares_active_pair
    ON public.rn_location_shares (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
    WHERE status IN ('pending', 'accepted');

ALTER TABLE public.rn_location_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_own_shares" ON public.rn_location_shares
    FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "rn_insert_shares" ON public.rn_location_shares
    FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "rn_update_own_shares" ON public.rn_location_shares
    FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- 2. rn_user_locations (latest GPS position per user)
CREATE TABLE IF NOT EXISTS public.rn_user_locations (
    user_id UUID PRIMARY KEY REFERENCES public.rn_profiles(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rn_user_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rn_read_partner_locations" ON public.rn_user_locations
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.rn_location_shares
            WHERE status = 'accepted'
            AND (
                (requester_id = auth.uid() AND recipient_id = rn_user_locations.user_id)
                OR (recipient_id = auth.uid() AND requester_id = rn_user_locations.user_id)
            )
        )
    );
CREATE POLICY "rn_upsert_own_location" ON public.rn_user_locations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rn_update_own_location" ON public.rn_user_locations
    FOR UPDATE USING (auth.uid() = user_id);

-- 3. Extend rn_notifications type check + add share_id column
ALTER TABLE public.rn_notifications
    DROP CONSTRAINT IF EXISTS rn_notifications_type_check;
ALTER TABLE public.rn_notifications
    ADD CONSTRAINT rn_notifications_type_check
    CHECK (type IN ('mention', 'location_share_request'));
ALTER TABLE public.rn_notifications
    ADD COLUMN IF NOT EXISTS share_id UUID REFERENCES public.rn_location_shares(id) ON DELETE CASCADE;

-- 4. Enable Realtime for new tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_location_shares;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_user_locations;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
;
