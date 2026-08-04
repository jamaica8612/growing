
-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.rn_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Route Zones Table
CREATE TABLE IF NOT EXISTS public.rn_route_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    polygon JSONB NOT NULL,
    color TEXT,
    memo TEXT,
    image_url TEXT,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 3. Route Tips Table
CREATE TABLE IF NOT EXISTS public.rn_route_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    marker_type TEXT NOT NULL CHECK (marker_type IN ('vehicle_entrance', 'parking', 'entrance', 'elevator', 'delivery_spot', 'warning', 'access_code', 'important')),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    tags TEXT[],
    memo TEXT,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_verified_at TIMESTAMPTZ,
    last_verified_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false
);

-- 4. Route Tip History Table
CREATE TABLE IF NOT EXISTS public.rn_route_tip_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Route Tip Photos Table
CREATE TABLE IF NOT EXISTS public.rn_route_tip_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID REFERENCES public.rn_route_tips(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 6. Route Paths Table
CREATE TABLE IF NOT EXISTS public.rn_route_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    memo TEXT,
    created_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- 7. Route Path Points Table
CREATE TABLE IF NOT EXISTS public.rn_route_path_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID REFERENCES public.rn_route_paths(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    title TEXT,
    memo TEXT
);

-- 9. Route Zone Photos Table
CREATE TABLE IF NOT EXISTS public.rn_route_zone_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES public.rn_route_zones(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES public.rn_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE public.rn_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tip_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_tip_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_path_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rn_route_zone_photos ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.rn_is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.rn_profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
CREATE POLICY "rn_enable_read_for_all" ON public.rn_profiles FOR SELECT USING (true);
CREATE POLICY "rn_write_profiles_for_auth" ON public.rn_profiles FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_zones_for_all" ON public.rn_route_zones FOR SELECT USING (true);
CREATE POLICY "rn_write_zones_for_auth" ON public.rn_route_zones FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_tips_for_all" ON public.rn_route_tips FOR SELECT USING (true);
CREATE POLICY "rn_write_tips_for_auth" ON public.rn_route_tips FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_history_for_all" ON public.rn_route_tip_history FOR SELECT USING (true);
CREATE POLICY "rn_write_history_for_auth" ON public.rn_route_tip_history FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_photos_for_all" ON public.rn_route_tip_photos FOR SELECT USING (true);
CREATE POLICY "rn_write_photos_for_auth" ON public.rn_route_tip_photos FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_paths_for_all" ON public.rn_route_paths FOR SELECT USING (true);
CREATE POLICY "rn_write_paths_for_auth" ON public.rn_route_paths FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_path_points_for_all" ON public.rn_route_path_points FOR SELECT USING (true);
CREATE POLICY "rn_write_path_points_for_auth" ON public.rn_route_path_points FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "rn_read_zone_photos_for_all" ON public.rn_route_zone_photos FOR SELECT USING (true);
CREATE POLICY "rn_write_zone_photos_for_auth" ON public.rn_route_zone_photos FOR ALL USING (auth.role() = 'authenticated');

-- Trigger: auto create profile on sign up
CREATE OR REPLACE FUNCTION public.rn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.rn_profiles (id, email, name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url',
        'member'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created_rn
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.rn_handle_new_user();

-- Trigger: log tip history
CREATE OR REPLACE FUNCTION public.rn_log_route_tip_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.rn_route_tip_history (tip_id, action, old_data, new_data, changed_by)
        VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.rn_route_tip_history (tip_id, action, old_data, new_data, changed_by)
        VALUES (NEW.id, 'INSERT', NULL, to_jsonb(NEW), NEW.created_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_route_tip_updated_rn
    AFTER INSERT OR UPDATE ON public.rn_route_tips
    FOR EACH ROW EXECUTE FUNCTION public.rn_log_route_tip_history();

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_route_tips;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_route_zones;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rn_route_zone_photos;
EXCEPTION WHEN others THEN NULL;
END $$;
;
