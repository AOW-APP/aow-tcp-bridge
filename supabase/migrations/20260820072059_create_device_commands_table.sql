-- Create device_commands table for store-and-forward downstream messaging
CREATE TABLE IF NOT EXISTS public.device_commands (
    id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT device_commands_pkey PRIMARY KEY,
    imei text NOT NULL,
    command text NOT NULL,
    payload text,
    status text DEFAULT 'pending'::text NOT NULL, -- 'pending', 'sent', 'failed'
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);

-- Index for retrieving pending commands for offline devices when they reconnect
CREATE INDEX IF NOT EXISTS idx_device_commands_queue 
ON public.device_commands (imei, status, created_at ASC);

-- Disable Row Level Security on the commands table
ALTER TABLE public.device_commands DISABLE ROW LEVEL SECURITY;

-- Grant permissions to roles
GRANT ALL ON TABLE public.device_commands TO postgres, service_role, authenticated, anon;
