export interface TelemetryEvent {
  imei: string;
  type: 'HEARTBEAT' | 'LOCATION' | 'ALARM' | 'BIOMETRICS' | 'UNKNOWN';
  manufacturer: string;
  commandType: string; // The raw command type string (e.g. 'LK', 'UD', 'UPLOAD', etc.)
  payloadParts: string[]; // Raw comma-separated parts of the payload
  battery?: number;
  steps?: number;
  gsmSignal?: number;
  coords?: {
    lon: number;
    lat: number;
    gpsState: string; // 'A' or 'V'
    speed: number;
  };
  biometrics?: {
    pulse?: number;
    systolic?: number;
    diastolic?: number;
    spo2?: number;
    temperature?: number;
  };
  alarmType?: 'SOS' | 'FALL' | 'REMOVE';
  lbs?: {
    mcc: number;
    mnc: number;
    lac: number;
    cellId: number;
  };
  wifi?: { mac: string; rssi: number }[];
}

export interface IProtocolParser {
  /**
   * Parses accumulated socket binary buffer.
   * Returns the consumed bytes and the parsed standardized event (if a complete frame was found).
   */
  parseBuffer(buffer: Uint8Array): { consumedBytes: number; event?: TelemetryEvent };

  /**
   * Formats a command string downstream into the manufacturer protocol frame.
   */
  formatCommand(imei: string, command: string, payload?: string): Uint8Array | string;
}
