-- Telemetry Sync Cache Trigger (Decoupled Sync Pipeline)
-- Automatically updates the cached telemetry metrics (battery, steps, gsm_signal, last_seen_at)
-- on the core B2B devices table whenever the high-frequency TCP Gateway inserts/updates the raw device_status log.

CREATE OR REPLACE FUNCTION public.fn_sync_device_status()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.devices
    SET battery = COALESCE(NEW.battery, battery),
        steps = COALESCE(NEW.steps, steps),
        gsm_signal = COALESCE(NEW.gsm_signal, gsm_signal),
        last_seen_at = NEW.last_activity,
        connection_status = TRUE
    WHERE imei = NEW.imei;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_sync_device_status
    AFTER INSERT OR UPDATE ON public.device_status
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_device_status();
