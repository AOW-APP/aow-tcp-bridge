-- Add audit and acknowledgment columns to device_commands table
ALTER TABLE public.device_commands 
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS client_ip text;
