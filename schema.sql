-- ═══════════════════════════════════════════════════════════════════════
-- Mayorcity E-Mart — Complete Supabase Database Schema v2
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════


-- ─── HELPER: role checker (avoids RLS recursion on profiles table) ────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- PROFILES
-- One row per auth.users user. Created by trigger on sign-up.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name           TEXT        NOT NULL DEFAULT '',
    email               TEXT        NOT NULL DEFAULT '',
    phone               TEXT        NOT NULL DEFAULT '',
    matric_number       TEXT        NOT NULL DEFAULT '',
    department          TEXT        NOT NULL DEFAULT '',
    level               TEXT        NOT NULL DEFAULT '',
    student_id_url      TEXT        NOT NULL DEFAULT '',
    role                TEXT        NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user','moderator','admin')),
    verification_status TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('pending','verified','rejected','suspended')),
    successful_sales    INTEGER     NOT NULL DEFAULT 0,
    rating_sum          NUMERIC     NOT NULL DEFAULT 0,
    rating_count        INTEGER     NOT NULL DEFAULT 0,
    blocked_users       UUID[]      NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Only authenticated users may SELECT the full profiles row.
-- Sensitive fields (phone, matric_number, department, level, student_id_url)
-- are never exposed to the unauthenticated anon role.
CREATE POLICY "profiles_auth_read"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Owner always has full read access to their own row
-- (covered by profiles_auth_read above once logged in, kept explicit for clarity)
CREATE POLICY "profiles_owner_read"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id AND public.get_my_role() <> 'admin');

CREATE POLICY "profiles_admin_update"
    ON public.profiles FOR UPDATE
    USING (public.get_my_role() = 'admin');

CREATE POLICY "profiles_admin_delete"
    ON public.profiles FOR DELETE
    USING (public.get_my_role() = 'admin');


-- Public-safe view: only non-sensitive fields exposed to the anon role.
-- script.js queries this view (instead of the full profiles table) when the
-- user is not signed in, so seller verification badges still render without
-- leaking phone, matric_number, department, level, or student_id_url.
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, full_name, verification_status, rating_sum, rating_count, successful_sales, created_at, role
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ─── TRIGGER: auto-create profile on sign-up ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════
-- LISTINGS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.listings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    emart_id        TEXT        UNIQUE NOT NULL,
    product_name    TEXT        NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN ('Market','Lost')),
    category        TEXT        NOT NULL DEFAULT 'Other Items',
    price           TEXT        NOT NULL DEFAULT '0',
    description     TEXT        NOT NULL DEFAULT '',
    image_url       TEXT        NOT NULL DEFAULT '',
    seller_name     TEXT        NOT NULL DEFAULT '',
    seller_whatsapp TEXT        NOT NULL DEFAULT '',
    reports         INTEGER     NOT NULL DEFAULT 0,
    status          TEXT        NOT NULL DEFAULT 'Active'
                        CHECK (status IN ('Active','Sold','Hidden','Removed')),
    payment_ref     TEXT        NOT NULL DEFAULT '',
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lost & Found extra fields (added in schema v3)
-- These columns are NULL for Marketplace listings; populated for Lost type.
-- lost_or_found: 'Lost' = poster is looking for item; 'Found' = poster found it.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS lost_or_found   TEXT CHECK (lost_or_found IN ('Lost','Found'));
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS location        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS date_lost_found DATE;

CREATE INDEX IF NOT EXISTS listings_user_id_idx   ON public.listings (user_id);
CREATE INDEX IF NOT EXISTS listings_type_idx      ON public.listings (type);
CREATE INDEX IF NOT EXISTS listings_status_idx    ON public.listings (status);
CREATE INDEX IF NOT EXISTS listings_created_at_idx ON public.listings (created_at DESC);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Public can read Active listings
CREATE POLICY "listings_public_read"
    ON public.listings FOR SELECT
    USING (status IN ('Active','Sold'));

-- Admins/mods can read everything including Hidden
CREATE POLICY "listings_staff_read"
    ON public.listings FOR SELECT
    USING (public.get_my_role() IN ('admin','moderator'));

-- Marketplace: only verified users can insert. Lost & Found: anyone (including guests).
CREATE POLICY "listings_verified_insert"
    ON public.listings FOR INSERT
    WITH CHECK (
        -- Marketplace listings require a verified authenticated user
        (type = 'Market' AND auth.uid() = user_id AND (
            public.get_my_role() IN ('admin','moderator')
            OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND verification_status = 'verified'
            )
        ))
        OR
        -- Lost & Found reports: anyone can post (guest with NULL user_id, or logged-in user)
        (type = 'Lost' AND (user_id IS NULL OR auth.uid() = user_id))
    );

-- Allow the 'anon' role (unauthenticated) to INSERT Lost & Found reports.
-- RLS WITH CHECK on the policy above still applies; this just grants the privilege.
GRANT INSERT ON public.listings TO anon;

-- Owner can update their own listing (verified users only)
CREATE POLICY "listings_owner_update"
    ON public.listings FOR UPDATE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND verification_status = 'verified'
        )
    );

-- Admin/moderator can update any listing (hide, restore, mark sold)
CREATE POLICY "listings_staff_update"
    ON public.listings FOR UPDATE
    USING (public.get_my_role() IN ('admin','moderator'));

-- Owner can delete their own listing
CREATE POLICY "listings_owner_delete"
    ON public.listings FOR DELETE
    USING (auth.uid() = user_id);

-- Admin can delete any listing
CREATE POLICY "listings_admin_delete"
    ON public.listings FOR DELETE
    USING (public.get_my_role() = 'admin');


-- ═══════════════════════════════════════════════════════════════════════
-- STUDENT VERIFICATIONS
-- One row per user. Admin reviews these to approve/reject.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.student_verifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT        NOT NULL DEFAULT '',
    email           TEXT        NOT NULL DEFAULT '',
    phone           TEXT        NOT NULL DEFAULT '',
    matric_number   TEXT        NOT NULL DEFAULT '',
    department      TEXT        NOT NULL DEFAULT '',
    level           TEXT        NOT NULL DEFAULT '',
    student_id_url  TEXT        NOT NULL DEFAULT '',
    status          TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','verified','rejected')),
    reviewed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    review_note     TEXT        NOT NULL DEFAULT '',
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

ALTER TABLE public.student_verifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own verification record
CREATE POLICY "verif_read_own"
    ON public.student_verifications FOR SELECT
    USING (auth.uid() = user_id OR public.get_my_role() IN ('admin','moderator'));

-- Users can insert their own record
CREATE POLICY "verif_insert_own"
    ON public.student_verifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admin/moderator can update (approve/reject)
CREATE POLICY "verif_staff_update"
    ON public.student_verifications FOR UPDATE
    USING (public.get_my_role() IN ('admin','moderator'));


-- ═══════════════════════════════════════════════════════════════════════
-- REPORTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    reported_listing_id UUID        REFERENCES public.listings(id) ON DELETE CASCADE,
    reported_user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    reason              TEXT        NOT NULL,
    details             TEXT        NOT NULL DEFAULT '',
    status              TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','reviewed','resolved','dismissed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_auth_insert"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "reports_staff_read"
    ON public.reports FOR SELECT
    USING (public.get_my_role() IN ('admin','moderator') OR auth.uid() = reporter_id);

CREATE POLICY "reports_staff_update"
    ON public.reports FOR UPDATE
    USING (public.get_my_role() IN ('admin','moderator'));


-- ═══════════════════════════════════════════════════════════════════════
-- RATINGS
-- Buyers rate sellers after a transaction. One rating per buyer per listing.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ratings (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rater_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    listing_id  UUID        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    rating      INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rater_id, listing_id)
);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings_public_read"
    ON public.ratings FOR SELECT USING (true);

CREATE POLICY "ratings_auth_insert"
    ON public.ratings FOR INSERT
    WITH CHECK (auth.uid() = rater_id AND auth.uid() <> seller_id);

-- After a rating is inserted, update seller's aggregate in profiles
CREATE OR REPLACE FUNCTION public.update_seller_rating()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET
        rating_sum   = rating_sum   + NEW.rating,
        rating_count = rating_count + 1
    WHERE id = NEW.seller_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_rating_insert ON public.ratings;
CREATE TRIGGER on_rating_insert
    AFTER INSERT ON public.ratings
    FOR EACH ROW EXECUTE FUNCTION public.update_seller_rating();


-- ═══════════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- Immutable. Admins/mods cannot delete their own audit entries.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audit_log (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email  TEXT        NOT NULL DEFAULT '',
    action       TEXT        NOT NULL,
    target_type  TEXT        NOT NULL DEFAULT '',
    target_id    TEXT        NOT NULL DEFAULT '',
    details      JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_staff_read"
    ON public.audit_log FOR SELECT
    USING (public.get_my_role() IN ('admin','moderator'));

CREATE POLICY "audit_staff_insert"
    ON public.audit_log FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin','moderator'));


-- ═══════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════

-- listing-images: public bucket (anyone can view via URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'listing-images', 'listing-images', true,
    5242880,
    ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "listing_images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'listing-images');

CREATE POLICY "listing_images_auth_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'listing-images' AND auth.role() = 'authenticated');

CREATE POLICY "listing_images_owner_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'listing-images' AND auth.uid()::text = owner);

-- student-ids: private bucket (only owner and admin can read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'student-ids', 'student-ids', false,
    5242880,
    ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "student_ids_owner_read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'student-ids'
        AND (
            auth.uid()::text = owner
            OR public.get_my_role() IN ('admin','moderator')
        )
    );

CREATE POLICY "student_ids_auth_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'student-ids' AND auth.role() = 'authenticated');


-- ═══════════════════════════════════════════════════════════════════════
-- PAYSTACK READINESS
-- payment_ref on listings already present. Add payments table for future use.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID        REFERENCES public.listings(id) ON DELETE SET NULL,
    buyer_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    amount_kobo     INTEGER     NOT NULL DEFAULT 0,
    currency        TEXT        NOT NULL DEFAULT 'NGN',
    paystack_ref    TEXT        UNIQUE NOT NULL DEFAULT '',
    status          TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed','refunded')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_parties_read"
    ON public.payments FOR SELECT
    USING (auth.uid() IN (buyer_id, seller_id) OR public.get_my_role() = 'admin');


-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY SETUP
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public';
-- SELECT id, name, public FROM storage.buckets;
