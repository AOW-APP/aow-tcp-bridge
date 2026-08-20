import { supabase } from '../supabase.ts';

export class DbService {
  /**
   * Updates the device latest status record in Supabase.
   */
  public static async updateDeviceStatus(
    imei: string, 
    status: { battery?: number; steps?: number; gsm_signal?: number; manufacturer?: string }
  ) {
    try {
      const { error } = await supabase
        .from('device_status')
        .upsert({
          imei,
          battery: status.battery,
          steps: status.steps,
          gsm_signal: status.gsm_signal,
          manufacturer: status.manufacturer,
          last_activity: new Date().toISOString()
        });
      if (error) throw error;
    } catch (err: any) {
      console.error(`[DB Error] Failed to update status for IMEI ${imei}:`, err.message);
    }
  }

  /**
   * Inserts a new historical location path record in Supabase.
   */
  public static async insertDeviceLocation(
    imei: string, 
    lon: number, 
    lat: number, 
    gpsState: string, 
    speed: number, 
    battery: number, 
    steps: number
  ) {
    try {
      const { error } = await supabase
        .from('device_locations')
        .insert({
          imei,
          location: `POINT(${lon} ${lat})`,
          gps_state: gpsState,
          speed,
          battery,
          steps,
          recorded_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (err: any) {
      console.error(`[DB Error] Failed to insert location for IMEI ${imei}:`, err.message);
    }
  }

  /**
   * Inserts a new biometric vital signs log entry in Supabase.
   */
  public static async insertDeviceBiometrics(
    imei: string, 
    metrics: { pulse?: number; systolic?: number; diastolic?: number; spo2?: number; temperature?: number }
  ) {
    try {
      const { error } = await supabase
        .from('device_biometrics')
        .insert({
          imei,
          pulse: metrics.pulse,
          systolic: metrics.systolic,
          diastolic: metrics.diastolic,
          spo2: metrics.spo2,
          temperature: metrics.temperature,
          recorded_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (err: any) {
      console.error(`[DB Error] Failed to insert biometrics for IMEI ${imei}:`, err.message);
    }
  }

  /**
   * Inserts a critical alert/alarm record in Supabase.
   */
  public static async insertDeviceAlarm(imei: string, eventType: string, coords?: { lon: number; lat: number }) {
    try {
      const { error } = await supabase
        .from('device_alarms')
        .insert({
          imei,
          event_type: eventType,
          location: coords ? `POINT(${coords.lon} ${coords.lat})` : null,
          resolved: false,
          created_at: new Date().toISOString()
        });
      if (error) throw error;
      console.log(`[DB] SOS Alert '${eventType}' successfully persisted to database.`);
    } catch (err: any) {
      console.error(`[DB Error] Failed to insert alarm for IMEI ${imei}:`, err.message);
    }
  }
}
