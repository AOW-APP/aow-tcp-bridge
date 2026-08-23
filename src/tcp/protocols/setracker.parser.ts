import type { IProtocolParser, TelemetryEvent } from '../../types/telemetry.ts';

const BYTE_START = 91;      // '['
const BYTE_END = 93;        // ']'
const BYTE_ASTERISK = 42;   // '*'

const decoder = new TextDecoder();

export class SeTrackerParser implements IProtocolParser {
  /**
   * Parses coordinate strings from SeTracker/NMEA format into signed decimal degrees.
   * Handles both decimal degrees (e.g. 19.4326) and DDMM.MMMM format (e.g. 2257.0733).
   */
  private parseCoordinate(valStr: string, dir: string): number {
    if (!valStr) return 0;
    let val = parseFloat(valStr);
    if (isNaN(val)) return 0;

    const dotIdx = valStr.indexOf('.');
    const intPart = dotIdx === -1 ? valStr : valStr.substring(0, dotIdx);

    if (intPart.length >= 3) {
      const degLen = intPart.length - 2;
      const deg = parseInt(intPart.substring(0, degLen), 10);
      const min = parseFloat(intPart.substring(degLen) + (dotIdx !== -1 ? valStr.substring(dotIdx) : ''));
      val = deg + (min / 60);
    }

    if (dir === 'S' || dir === 'W') {
      val = -val;
    }
    return val;
  }

  /**
   * Standard SeTracker byte stream buffer parser.
   */
  public parseBuffer(buffer: Uint8Array): { consumedBytes: number; event?: TelemetryEvent } {
    if (buffer.length === 0) {
      return { consumedBytes: 0 };
    }

    const startIdx = buffer.indexOf(BYTE_START);
    if (startIdx === -1) {
      // Discard all garbage if no start bracket is found
      return { consumedBytes: buffer.length };
    }

    // Discard leading garbage bytes up to the start bracket
    if (startIdx > 0) {
      return { consumedBytes: startIdx };
    }

    // Find header separators
    const idx1 = buffer.indexOf(BYTE_ASTERISK, 1);
    if (idx1 === -1) return { consumedBytes: 0 }; // Wait for more data

    const idx2 = buffer.indexOf(BYTE_ASTERISK, idx1 + 1);
    if (idx2 === -1) return { consumedBytes: 0 }; // Wait for more data

    const idx3 = buffer.indexOf(BYTE_ASTERISK, idx2 + 1);
    if (idx3 === -1) return { consumedBytes: 0 }; // Wait for more data

    const company = decoder.decode(buffer.subarray(1, idx1));
    const imei = decoder.decode(buffer.subarray(idx1 + 1, idx2));
    const lengthHex = decoder.decode(buffer.subarray(idx2 + 1, idx3));

    const dataLength = parseInt(lengthHex, 16);
    if (isNaN(dataLength)) {
      // Corrupt length header, discard starting bracket to re-align
      return { consumedBytes: 1 };
    }

    const totalFrameLen = idx3 + 1 + dataLength + 1;
    if (buffer.length < totalFrameLen) {
      return { consumedBytes: 0 }; // Wait for the remaining bytes
    }

    if (buffer[totalFrameLen - 1] !== BYTE_END) {
      // Unaligned end bracket, discard start bracket to re-align
      return { consumedBytes: 1 };
    }

    // Extract payload clean string
    const payload = decoder.decode(buffer.subarray(idx3 + 1, totalFrameLen - 1));
    const event = this.parsePayload(company, imei, payload);
    event.rawFrame = decoder.decode(buffer.subarray(0, totalFrameLen));

    return { consumedBytes: totalFrameLen, event };
  }

  /**
   * Normalizes the parsed protocol clean payload string into a standard TelemetryEvent.
   */
  private parsePayload(company: string, imei: string, payload: string): TelemetryEvent {
    const parts = payload.split(',');
    const commandType = parts[0];

    const baseEvent: TelemetryEvent = {
      imei,
      manufacturer: company,
      commandType,
      payloadParts: parts.slice(1),
      type: 'UNKNOWN'
    };

    switch (commandType) {
      case 'LK': {
        const [_, gsmSignalStr, batteryPercentStr, stepsStr] = parts;
        baseEvent.type = 'HEARTBEAT';
        baseEvent.gsmSignal = gsmSignalStr ? parseInt(gsmSignalStr, 10) : undefined;
        baseEvent.battery = batteryPercentStr ? parseInt(batteryPercentStr, 10) : undefined;
        baseEvent.steps = stepsStr ? parseInt(stepsStr, 10) : undefined;
        return baseEvent;
      }

      case 'UD':
      case 'UD2':
      case 'UD_LTE': {
        const [
          _, date, time, gpsState, latStr, latDir, lonStr, lonDir, 
          speedStr, direction, altitude, satellites, gsmSignalStr, batteryPercentStr, stepsStr
        ] = parts;

        baseEvent.type = 'LOCATION';
        baseEvent.battery = batteryPercentStr ? parseInt(batteryPercentStr, 10) : undefined;
        baseEvent.steps = stepsStr ? parseInt(stepsStr, 10) : undefined;
        baseEvent.gsmSignal = gsmSignalStr ? parseInt(gsmSignalStr, 10) : undefined;

        const lat = this.parseCoordinate(latStr, latDir);
        const lon = this.parseCoordinate(lonStr, lonDir);

        if (gpsState === 'A' || (gpsState === 'V' && (lat !== 0 || lon !== 0))) {
          baseEvent.coords = {
            lat,
            lon,
            gpsState,
            speed: speedStr ? parseFloat(speedStr) : 0
          };
        } else if (parts[18] && parts[19] && parts[20] && parts[21]) {
          baseEvent.lbs = {
            mcc: parseInt(parts[18], 10),
            mnc: parseInt(parts[19], 10),
            lac: parseInt(parts[20], 10),
            cellId: parseInt(parts[21], 10)
          };
        }
        return baseEvent;
      }

      case 'AL':
      case 'AL_LTE': {
        const [
          _, date, time, gpsState, latStr, latDir, lonStr, lonDir, 
          speedStr, direction, altitude, satellites, gsmSignalStr, batteryPercentStr, stepsStr
        ] = parts;

        baseEvent.type = 'ALARM';
        baseEvent.alarmType = 'SOS';
        baseEvent.battery = batteryPercentStr ? parseInt(batteryPercentStr, 10) : undefined;
        baseEvent.steps = stepsStr ? parseInt(stepsStr, 10) : undefined;
        baseEvent.gsmSignal = gsmSignalStr ? parseInt(gsmSignalStr, 10) : undefined;

        const lat = this.parseCoordinate(latStr, latDir);
        const lon = this.parseCoordinate(lonStr, lonDir);

        if (gpsState === 'A' || (gpsState === 'V' && (lat !== 0 || lon !== 0))) {
          baseEvent.coords = {
            lat,
            lon,
            gpsState,
            speed: speedStr ? parseFloat(speedStr) : 0
          };
        } else if (parts[18] && parts[19] && parts[20] && parts[21]) {
          baseEvent.lbs = {
            mcc: parseInt(parts[18], 10),
            mnc: parseInt(parts[19], 10),
            lac: parseInt(parts[20], 10),
            cellId: parseInt(parts[21], 10)
          };
        }
        return baseEvent;
      }

      case 'LBS': {
        const [_, mccStr, mncStr, lacStr, cellIdStr, rssiStr] = parts;
        baseEvent.type = 'LOCATION';
        baseEvent.lbs = {
          mcc: parseInt(mccStr, 10),
          mnc: parseInt(mncStr, 10),
          lac: parseInt(lacStr, 10),
          cellId: parseInt(cellIdStr, 10)
        };
        baseEvent.gsmSignal = rssiStr ? parseInt(rssiStr, 10) : undefined;
        return baseEvent;
      }

      case 'WIFI':
      case 'WG': {
        const [_, date, time, ...wifiList] = parts;
        baseEvent.type = 'LOCATION';
        const wifi: { mac: string; rssi: number }[] = [];
        for (let i = 0; i < wifiList.length; i += 2) {
          if (wifiList[i]) {
            wifi.push({
              mac: wifiList[i],
              rssi: wifiList[i + 1] ? parseInt(wifiList[i + 1], 10) : 0
            });
          }
        }
        baseEvent.wifi = wifi;
        return baseEvent;
      }

      case 'bphrt': {
        const [_, pulseStr, systolicStr, diastolicStr] = parts;
        baseEvent.type = 'BIOMETRICS';
        baseEvent.biometrics = {
          pulse: pulseStr ? parseInt(pulseStr, 10) : undefined,
          systolic: systolicStr ? parseInt(systolicStr, 10) : undefined,
          diastolic: diastolicStr ? parseInt(diastolicStr, 10) : undefined
        };
        return baseEvent;
      }

      case 'oxygen': {
        const [_, spO2Str] = parts;
        baseEvent.type = 'BIOMETRICS';
        baseEvent.biometrics = {
          spo2: spO2Str ? parseInt(spO2Str, 10) : undefined
        };
        return baseEvent;
      }

      case 'btemp2': {
        const [_, tempStr] = parts;
        baseEvent.type = 'BIOMETRICS';
        baseEvent.biometrics = {
          temperature: tempStr ? parseFloat(tempStr) : undefined
        };
        return baseEvent;
      }

      case 'FALL': {
        baseEvent.type = 'ALARM';
        baseEvent.alarmType = 'FALL';
        return baseEvent;
      }

      case 'REMOVE': {
        baseEvent.type = 'ALARM';
        baseEvent.alarmType = 'REMOVE';
        return baseEvent;
      }

      default: {
        return baseEvent;
      }
    }
  }

  /**
   * Formats a downstream command frame for SeTracker protocol.
   */
  public formatCommand(imei: string, command: string, payload?: string): Uint8Array | string {
    const manufacturer = "3G";
    const commandContent = payload ? `${command},${payload}` : command;
    const lenHex = commandContent.length.toString(16).toUpperCase().padStart(4, "0");
    return `[${manufacturer}*${imei}*${lenHex}*${commandContent}]`;
  }
}
