import type { Socket } from "bun";

export interface DeviceSessionData {
    deviceId?: string;
    manufacturer?: string;
    buffer: string;
    connectedAt: Date;
    lastHeartbeat: Date;
}

export type BunDeviceSocket = Socket<DeviceSessionData>;