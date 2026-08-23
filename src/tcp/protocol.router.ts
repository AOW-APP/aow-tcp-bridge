import type { TelemetryEvent } from '../types/telemetry.ts';
import { DbService } from '../services/db.service.ts';
import { LbsService } from '../services/lbs.service.ts';
import { CommandService } from '../services/command.service.ts';
import { sessionStore } from './sessionStore.ts';
import type { BunDeviceSocket } from '../types/session.ts';

export class ProtocolRouter {
  /**
   * Routes normalized telemetry events to respective persistence and business services.
   */
  public static async route(socket: BunDeviceSocket, event: TelemetryEvent) {
    const { imei, type, manufacturer, commandType, payloadParts } = event;

    // Persist raw frame for diagnostic/auditing logging if it carries data after the command type
    const hasPayloadData = payloadParts && payloadParts.length > 0 && payloadParts.some(part => part.trim() !== '');
    if (event.rawFrame && hasPayloadData) {
      await DbService.insertRawFrame(imei, event.rawFrame, socket.remoteAddress);
    }

    console.log(`\n[TCP Server] 📥 Processed Frame - IMEI: ${imei}, Type: ${commandType}`);

    // Register active device connection in the sessionStore
    if (!sessionStore.isOnline(imei)) {
      sessionStore.register(imei, socket, manufacturer);
      console.log(`[TCP Server] Device ${imei} registered in active session store.`);
      
      // Pull and send pending commands queued while device was offline (only if server is not read-only)
      const readOnly = Bun.env.SOCKET_READ_ONLY === 'true';
      if (!readOnly) {
        CommandService.processPendingCommands(imei);
      } else {
        console.log(`[TCP Server] Read-only mode active. Suppressed pulling pending commands queue.`);
      }
    } else {
      // Update heartbeat timestamp
      socket.data.lastHeartbeat = new Date();
    }

    switch (type) {
      case 'HEARTBEAT': {
        console.log(`   └─ LK Telemetry -> GSM Signal: ${event.gsmSignal ?? 'N/A'}, Battery: ${event.battery ?? 'N/A'}%, Steps: ${event.steps ?? 'N/A'}`);
        await DbService.updateDeviceStatus(imei, {
          battery: event.battery,
          steps: event.steps,
          gsm_signal: event.gsmSignal,
          manufacturer
        });
        return;
      }

      case 'LOCATION': {
        // A. Standard GPS coordinates event
        if (event.coords) {
          console.log(`   └─ Location Telemetry (${commandType}) -> Lat: ${event.coords.lat}, Lon: ${event.coords.lon}, GPS State: ${event.coords.gpsState}`);
          
          await DbService.updateDeviceStatus(imei, {
            battery: event.battery,
            steps: event.steps,
            gsm_signal: event.gsmSignal,
            manufacturer
          });

          await DbService.insertDeviceLocation(
            imei,
            event.coords.lon,
            event.coords.lat,
            event.coords.gpsState,
            event.coords.speed,
            event.battery ?? 0,
            event.steps ?? 0
          );
        }
        
        // B. Cellular Base Station network location event (LBS)
        else if (event.lbs) {
          const { mcc, mnc, lac, cellId } = event.lbs;
          console.log(`   └─ LBS Telemetry -> MCC: ${mcc}, MNC: ${mnc}, LAC: ${lac}, CellID: ${cellId}`);
          
          await DbService.updateDeviceStatus(imei, {
            gsm_signal: event.gsmSignal,
            manufacturer
          });

          // Asynchronously query self-hosted database for celdas locations
          LbsService.resolveCellTower(mcc, mnc, lac, cellId, event.commandType)
            .then(async (coords) => {
              if (coords) {
                console.log(`   📍 [LBS Resolved] -> Lat: ${coords.lat}, Lon: ${coords.lon}`);
                await DbService.insertDeviceLocation(imei, coords.lon, coords.lat, 'V', 0, 0, 0);
              } else {
                console.warn(`   [LBS Miss] -> Cell ID not found in database.`);
              }
            })
            .catch((err) => {
              console.error(`   [LBS Error] -> Query failure:`, err.message);
            });
        }
        
        // C. WiFi networks location event
        else if (event.wifi) {
          console.log(`   └─ WiFi Telemetry -> Detected Networks:`, event.wifi.length);
          await DbService.updateDeviceStatus(imei, { manufacturer });
        }
        return;
      }

      case 'ALARM': {
        // A. SOS Alarm button trigger
        if (event.alarmType === 'SOS') {
          const lat = event.coords?.lat ?? 0;
          const lon = event.coords?.lon ?? 0;
          console.log(`   ⚠️  [SOS ALERT DETECTED] -> Lat: ${lat}, Lon: ${lon}`);

          await DbService.updateDeviceStatus(imei, {
            battery: event.battery,
            steps: event.steps,
            gsm_signal: event.gsmSignal,
            manufacturer
          });

          if (event.coords) {
            await DbService.insertDeviceLocation(
              imei,
              lon,
              lat,
              event.coords.gpsState,
              event.coords.speed,
              event.battery ?? 0,
              event.steps ?? 0
            );
          }

          await DbService.insertDeviceAlarm(imei, 'SOS', event.coords);
        }
        
        // B. Fall down sensor alarm
        else if (event.alarmType === 'FALL') {
          console.log(`   ⚠️ [CRITICAL ALERT] Fall detected!`);
          await DbService.insertDeviceAlarm(imei, 'FALL');
        }
        
        // C. Wrist removal sensor alarm
        else if (event.alarmType === 'REMOVE') {
          console.log(`   ⚠️ [ALERT] Watch removed from the patient's wrist!`);
          await DbService.insertDeviceAlarm(imei, 'REMOVE');
        }
        return;
      }

      case 'BIOMETRICS': {
        if (event.biometrics) {
          const { pulse, systolic, diastolic, spo2, temperature } = event.biometrics;
          
          if (pulse !== undefined) {
            console.log(`   └─ Biometric Telemetry (bphrt) -> Pulse: ${pulse} bpm, Blood Pressure: ${systolic}/${diastolic} mmHg`);
            await DbService.insertDeviceBiometrics(imei, { pulse, systolic, diastolic });
          } 
          else if (spo2 !== undefined) {
            console.log(`   └─ Biometric Telemetry (oxygen) -> SpO2: ${spo2}%`);
            await DbService.insertDeviceBiometrics(imei, { spo2 });
          } 
          else if (temperature !== undefined) {
            console.log(`   └─ Biometric Telemetry (btemp2) -> Temperature: ${temperature}°C`);
            await DbService.insertDeviceBiometrics(imei, { temperature });
          }
        }
        return;
      }

      case 'UNKNOWN':
      default: {
        console.log(`   └─ Unmapped command or response from device:`, commandType, payloadParts);
        
        // Treat as potentially an acknowledgment confirmation reply from the device
        await CommandService.acknowledgeCommand(imei, commandType);
        return;
      }
    }
  }
}
