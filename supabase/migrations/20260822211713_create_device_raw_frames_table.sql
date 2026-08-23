-- Create device_raw_frames table to store raw ASCII/binary payloads for auditing and diagnostic debugging
CREATE TABLE IF NOT EXISTS public.device_raw_frames (
    id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT device_raw_frames_pkey PRIMARY KEY,
    imei text,
    raw_data text NOT NULL,
    client_ip text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for quick lookups by IMEI and time range
CREATE INDEX IF NOT EXISTS idx_device_raw_frames_lookup 
ON public.device_raw_frames (imei, received_at DESC);

-- Disable Row Level Security on the diagnostic table
ALTER TABLE public.device_raw_frames DISABLE ROW LEVEL SECURITY;

-- Grant permissions to roles
GRANT ALL ON TABLE public.device_raw_frames TO postgres, service_role, authenticated, anon;
