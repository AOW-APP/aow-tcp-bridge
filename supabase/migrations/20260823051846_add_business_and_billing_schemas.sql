-- Custom Enum Types
CREATE TYPE public.tenant_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'TRIAL'
);

CREATE TYPE public.billing_cycle AS ENUM (
    'ONCE',
    'MONTHLY',
    'BIMONTHLY',
    'QUARTERLY',
    'SEMI_ANNUALLY',
    'ANNUALLY'
);

CREATE TYPE public.user_role AS ENUM (
    'ADMINISTRATOR',
    'RELATIVE',
    'PHYSIOTHERAPIST',
    'CAREGIVER',
    'CORPORATION',
    'DOCTOR',
    'NURSE',
    'ASSISTANT',
    'CLEANER'
);

CREATE TYPE public.device_type AS ENUM (
    'SMARTWATCH',
    'EMERGENCY_BUTTON'
);

CREATE TYPE public.device_acquisition AS ENUM (
    'RENTAL',
    'PURCHASED'
);

CREATE TYPE public.inventory_status AS ENUM (
    'STOCK',
    'ACTIVE',
    'MAINTENANCE',
    'RETIRED'
);

CREATE TYPE public.device_condition AS ENUM (
    'NEW',
    'EXCELLENT',
    'GOOD',
    'REFURBISHED',
    'DAMAGED',
    'LOST'
);

CREATE TYPE public.device_log_type AS ENUM (
    'ALLOCATION',
    'MAINTENANCE',
    'REPAIR',
    'DAMAGE',
    'RETRIEVAL',
    'INSPECTION'
);

CREATE TYPE public.sim_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'INACTIVE'
);

CREATE TYPE public.invoice_status AS ENUM (
    'PAID',
    'PENDING',
    'OVERDUE',
    'CANCELLED'
);

CREATE TYPE public.catalog_item_type AS ENUM (
    'HARDWARE_PURCHASE',
    'HARDWARE_RENTAL',
    'SERVICE_SUBSCRIPTION',
    'SIM_PLAN',
    'SETUP_FEE'
);

CREATE TYPE public.quote_status AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED'
);

CREATE TYPE public.patient_gender AS ENUM (
    'MALE',
    'FEMALE'
);

CREATE TYPE public.reminder_frequency AS ENUM (
    'ONCE',
    'DAILY',
    'CUSTOM'
);

-- A. Tenants, Contracts & Invoices
CREATE TABLE public.centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cif VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status public.tenant_status NOT NULL DEFAULT 'ACTIVE',
    billing_name VARCHAR(255),
    billing_email VARCHAR(255),
    billing_phone VARCHAR(50),
    billing_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    contract_number VARCHAR(100) UNIQUE NOT NULL,
    billing_cycle public.billing_cycle NOT NULL DEFAULT 'MONTHLY',
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    device_limit INT NOT NULL DEFAULT 50,
    start_date DATE NOT NULL,
    end_date DATE,
    contract_pdf_path VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    status public.invoice_status NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(100),
    invoice_pdf_url VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- B. User Profiles & RBAC
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    lastname VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.profile_centers (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE,
    role public.user_role NOT NULL DEFAULT 'CAREGIVER',
    view_all BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (profile_id, center_id)
);

-- C. Patients, SIM Cards & IoT Devices
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    dni VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    lastname VARCHAR(255) NOT NULL,
    gender public.patient_gender,
    birthdate DATE,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    zone VARCHAR(100),
    floor VARCHAR(100),
    room VARCHAR(100),
    bed VARCHAR(100),
    diseases TEXT,
    vital_treatments TEXT,
    treatments TEXT,
    medical_history TEXT,
    remarks TEXT,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    contact_address TEXT,
    alarm_config JSONB NOT NULL DEFAULT '{
        "low_battery": {"threshold": 15},
        "oxygen": {"threshold_min": 85},
        "temperature": {"threshold_max": 37.5},
        "heart_rate": {"min": 60, "max": 100},
        "blood_pressure": {
            "systolic_min": 85,
            "systolic_max": 145,
            "diastolic_min": 55,
            "diastolic_max": 95
        }
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Junction table for Patient to User assignments
CREATE TABLE public.profile_patients (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, patient_id)
);

CREATE TABLE public.sim_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iccid VARCHAR(20) UNIQUE NOT NULL,
    phone_number VARCHAR(50) UNIQUE,
    carrier VARCHAR(100) NOT NULL,
    plan_name VARCHAR(100),
    monthly_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status public.sim_status NOT NULL DEFAULT 'INACTIVE',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    sim_card_id UUID REFERENCES public.sim_cards(id) ON DELETE SET NULL,
    imei VARCHAR(15) UNIQUE NOT NULL,
    full_imei VARCHAR(15),
    type public.device_type NOT NULL DEFAULT 'SMARTWATCH',
    acquisition_mode public.device_acquisition NOT NULL DEFAULT 'RENTAL',
    inventory_state public.inventory_status NOT NULL DEFAULT 'STOCK',
    physical_condition public.device_condition NOT NULL DEFAULT 'NEW',
    paused BOOLEAN NOT NULL DEFAULT false,
    battery INT DEFAULT 0,
    gsm_signal INT DEFAULT 0,
    steps INT DEFAULT 0,
    connection_status BOOLEAN DEFAULT false,
    last_seen_at TIMESTAMPTZ,
    settings JSONB NOT NULL DEFAULT '{
        "phonebook": [],
        "refresh_interval": 600,
        "clock_notice": 0
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.device_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    log_type public.device_log_type NOT NULL DEFAULT 'INSPECTION',
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    cost NUMERIC(10,2) DEFAULT 0.00,
    logged_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100) NOT NULL,
    port INT,
    username VARCHAR(100),
    password VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- D. Schedules, Reminders & Care Reports
CREATE TABLE public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    reminder_number INT NOT NULL DEFAULT 1,
    reminder_text VARCHAR(100) NOT NULL,
    voice_url VARCHAR(255),
    hour INT NOT NULL,
    minute INT NOT NULL,
    days VARCHAR(50),
    frequency public.reminder_frequency NOT NULL DEFAULT 'ONCE',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    caregiver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    schedule_timestamp TIMESTAMPTZ NOT NULL,
    schedule_type VARCHAR(100) NOT NULL,
    alternative_address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    caregiver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    content TEXT,
    pdf_url VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- E. Catalog Price Management & Quote Proposals
CREATE TABLE public.pricing_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type public.catalog_item_type NOT NULL,
    cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    billing_cycle public.billing_cycle NOT NULL DEFAULT 'MONTHLY',
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    status public.quote_status NOT NULL DEFAULT 'DRAFT',
    valid_until DATE NOT NULL,
    total_recurring NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_one_time NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    catalog_id UUID REFERENCES public.pricing_catalog(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    item_type public.catalog_item_type NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    billing_cycle public.billing_cycle NOT NULL DEFAULT 'MONTHLY',
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- F. Enable Row Level Security (RLS) on all tables (Remediates Supabase warnings)
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Enable RLS on telemetry logs tables
ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_biometrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_raw_frames ENABLE ROW LEVEL SECURITY;

-- G. RLS Helper Functions
CREATE OR REPLACE FUNCTION public.fn_get_user_center()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT center_id 
        FROM public.profile_centers 
        WHERE profile_id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_is_tenant_active(target_center_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.centers 
        WHERE id = target_center_id AND status = 'ACTIVE'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_is_corporation_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profile_centers 
        WHERE profile_id = auth.uid() 
          AND role = 'CORPORATION'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user has access to target patient
CREATE OR REPLACE FUNCTION public.fn_has_patient_access(target_patient_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_center_id UUID;
    user_role public.user_role;
    user_view_all BOOLEAN;
BEGIN
    -- 1. If Corporation user, always allow
    IF public.fn_is_corporation_user() THEN
        RETURN TRUE;
    END IF;

    -- Get target patient's center
    SELECT center_id INTO user_center_id FROM public.patients WHERE id = target_patient_id;

    -- Get user role and view_all for this center
    SELECT role, view_all INTO user_role, user_view_all
    FROM public.profile_centers
    WHERE profile_id = auth.uid() AND center_id = user_center_id;

    -- If not member of the center, or center suspended, block
    IF user_role IS NULL OR NOT public.fn_is_tenant_active(user_center_id) THEN
        RETURN FALSE;
    END IF;

    -- 2. If Administrator or has view_all, allow
    IF user_role = 'ADMINISTRATOR' OR user_view_all = TRUE THEN
        RETURN TRUE;
    END IF;

    -- 3. Otherwise, check direct assignment in profile_patients
    RETURN EXISTS (
        SELECT 1 
        FROM public.profile_patients 
        WHERE profile_id = auth.uid() 
          AND patient_id = target_patient_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user has access to target device (via patients assignment)
CREATE OR REPLACE FUNCTION public.fn_has_device_access(target_imei TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    device_patient_id UUID;
    device_center_id UUID;
    user_role public.user_role;
    user_view_all BOOLEAN;
BEGIN
    -- 1. If Corporation user, always allow
    IF public.fn_is_corporation_user() THEN
        RETURN TRUE;
    END IF;

    -- Fetch device center and patient
    SELECT center_id, patient_id INTO device_center_id, device_patient_id
    FROM public.devices
    WHERE imei = target_imei;

    IF device_center_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get user center role
    SELECT role, view_all INTO user_role, user_view_all
    FROM public.profile_centers
    WHERE profile_id = auth.uid() AND center_id = device_center_id;

    IF user_role IS NULL OR NOT public.fn_is_tenant_active(device_center_id) THEN
        RETURN FALSE;
    END IF;

    -- 2. If Administrator or has view_all, allow
    IF user_role = 'ADMINISTRATOR' OR user_view_all = TRUE THEN
        RETURN TRUE;
    END IF;

    -- 3. Otherwise, check access via patient assignment
    IF device_patient_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN public.fn_has_patient_access(device_patient_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H. RLS Policies

-- 1. Patients Policy (Isolated by patient access rules)
CREATE POLICY policy_patients_tenant_isolation ON public.patients
    FOR ALL TO authenticated
    USING (public.fn_has_patient_access(id))
    WITH CHECK (public.fn_has_patient_access(id));

-- 2. Devices Policy (Isolated by center + patient assignment checks)
CREATE POLICY policy_devices_tenant_isolation ON public.devices
    FOR ALL TO authenticated
    USING (
        public.fn_is_corporation_user()
        OR (
            center_id = public.fn_get_user_center()
            AND public.fn_is_tenant_active(center_id)
            AND (
                EXISTS (
                    SELECT 1 FROM public.profile_centers 
                    WHERE profile_id = auth.uid() AND center_id = devices.center_id 
                      AND (role = 'ADMINISTRATOR' OR view_all = true)
                )
                OR (
                    patient_id IS NOT NULL AND public.fn_has_patient_access(patient_id)
                )
            )
        )
    );

-- 3. Contracts Policy (Center staff can read, corporation manages)
CREATE POLICY policy_contracts_tenant_isolation ON public.contracts
    FOR ALL
    TO authenticated
    USING (
        (center_id = public.fn_get_user_center() AND public.fn_is_tenant_active(center_id))
        OR public.fn_is_corporation_user()
    );

-- 4. Invoices Policy (Center staff can read, corporation manages)
CREATE POLICY policy_invoices_tenant_isolation ON public.invoices
    FOR ALL
    TO authenticated
    USING (
        (center_id = public.fn_get_user_center() AND public.fn_is_tenant_active(center_id))
        OR public.fn_is_corporation_user()
    );

-- 5. Device Logs Policy (Isolated by device's center or corporation)
CREATE POLICY policy_device_logs_tenant_isolation ON public.device_logs
    FOR ALL
    TO authenticated
    USING (
        (
            device_id IN (
                SELECT id FROM public.devices WHERE center_id = public.fn_get_user_center()
            )
            AND public.fn_is_tenant_active(public.fn_get_user_center())
        )
        OR public.fn_is_corporation_user()
    );

-- 6. SIM Cards Policy (Only Corporation/Owner can read or write)
CREATE POLICY policy_sim_cards_corporation_only ON public.sim_cards
    FOR ALL TO authenticated
    USING (public.fn_is_corporation_user());

-- 7. Quotes Policy (Only Corporation/Owner can read or write)
CREATE POLICY policy_quotes_corporation_only ON public.quotes
    FOR ALL TO authenticated
    USING (public.fn_is_corporation_user());

-- 8. Quote Items Policy (Only Corporation/Owner can read or write)
CREATE POLICY policy_quote_items_corporation_only ON public.quote_items
    FOR ALL TO authenticated
    USING (public.fn_is_corporation_user());

-- 9. Pricing Catalog Policy (All users can read catalog items, only Corporation can write)
CREATE POLICY policy_pricing_catalog_read_all ON public.pricing_catalog
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY policy_pricing_catalog_write_corporation ON public.pricing_catalog
    FOR ALL TO authenticated
    USING (public.fn_is_corporation_user())
    WITH CHECK (public.fn_is_corporation_user());

-- 10. Telemetry Tables Policies (RBAC Enforced Access Control via fn_has_device_access)
CREATE POLICY policy_telemetry_status_isolation ON public.device_status
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

CREATE POLICY policy_telemetry_locations_isolation ON public.device_locations
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

CREATE POLICY policy_telemetry_biometrics_isolation ON public.device_biometrics
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

CREATE POLICY policy_telemetry_alarms_isolation ON public.device_alarms
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

CREATE POLICY policy_telemetry_commands_isolation ON public.device_commands
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

CREATE POLICY policy_telemetry_raw_frames_isolation ON public.device_raw_frames
    FOR ALL TO authenticated USING (public.fn_has_device_access(imei));

-- I. Device Limits Trigger Enforcement
CREATE OR REPLACE FUNCTION public.fn_check_device_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_device_count INT;
    allowed_device_limit INT;
BEGIN
    -- Count all existing active devices for this center
    SELECT COUNT(*) 
    INTO current_device_count
    FROM public.devices
    WHERE center_id = NEW.center_id;

    -- Fetch the active device limit from the contract (evaluating the currently active date range)
    SELECT device_limit
    INTO allowed_device_limit
    FROM public.contracts
    WHERE center_id = NEW.center_id
      AND start_date <= CURRENT_DATE 
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no contract exists, default to 0 limit (must have a contract to register devices)
    IF allowed_device_limit IS NULL THEN
        RAISE EXCEPTION 'Registration blocked: Center has no active contract configured.';
    END IF;

    -- Enforce the limit
    IF current_device_count >= allowed_device_limit THEN
        RAISE EXCEPTION 'Registration blocked: Device limit of % exceeded for this center contract.', allowed_device_limit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_before_device_insert
    BEFORE INSERT ON public.devices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_device_limit();
