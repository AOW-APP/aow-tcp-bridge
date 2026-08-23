-- 1. Create device_status table (latest state per watch)
CREATE TABLE IF NOT EXISTS public.device_status (
    imei text CONSTRAINT device_status_pkey PRIMARY KEY,
    battery integer,
    steps integer,
    gsm_signal integer,
    manufacturer text,
    last_activity timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create device_locations table (historical location logs)
CREATE TABLE IF NOT EXISTS public.device_locations (
    id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT device_locations_pkey PRIMARY KEY,
    imei text NOT NULL,
    location extensions.geography(point, 4326) NOT NULL,
    gps_state text,
    speed numeric,
    battery integer,
    steps integer,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for querying device paths by IMEI and time range
CREATE INDEX IF NOT EXISTS idx_device_locations_lookup 
ON public.device_locations (imei, recorded_at DESC);

-- Spatial index for geographical/distance searches
CREATE INDEX IF NOT EXISTS idx_device_locations_geom 
ON public.device_locations USING gist (location);

-- 3. Create device_biometrics table (historical health metrics)
CREATE TABLE IF NOT EXISTS public.device_biometrics (
    id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT device_biometrics_pkey PRIMARY KEY,
    imei text NOT NULL,
    pulse integer,
    systolic integer,
    diastolic integer,
    spo2 integer,
    temperature numeric,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for health graph generation
CREATE INDEX IF NOT EXISTS idx_device_biometrics_lookup 
ON public.device_biometrics (imei, recorded_at DESC);

-- 4. Create device_alarms table (emergency alerts log)
CREATE TABLE IF NOT EXISTS public.device_alarms (
    id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT device_alarms_pkey PRIMARY KEY,
    imei text NOT NULL,
    event_type text NOT NULL, -- 'SOS', 'FALL', 'REMOVE'
    location extensions.geography(point, 4326),
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for operator pending alert queries
CREATE INDEX IF NOT EXISTS idx_device_alarms_lookup 
ON public.device_alarms (imei, resolved, created_at DESC);

-- Disable Row Level Security on the new telemetry tables
ALTER TABLE public.device_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_biometrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_alarms DISABLE ROW LEVEL SECURITY;

-- Grant permissions to all roles
GRANT ALL ON TABLE public.device_status TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.device_locations TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.device_biometrics TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.device_alarms TO postgres, service_role, authenticated, anon;
