import type { BunDeviceSocket } from "../types/session";

class SessionStore {
    // Mapea deviceId (10 dígitos) -> Socket TCP de Bun
    private sessions = new Map<string, BunDeviceSocket>();

    /**
     * Registra o actualiza la sesión activa del dispositivo
     */
    public register(deviceId: string, socket: BunDeviceSocket, manufacturer?: string): void {
        socket.data.deviceId = deviceId;
        if (manufacturer) {
            socket.data.manufacturer = manufacturer;
        }
        socket.data.lastHeartbeat = new Date();
        this.sessions.set(deviceId, socket);
    }

    /**
     * Obtiene el socket activo de un dispositivo
     */
    public get(deviceId: string): BunDeviceSocket | undefined {
        return this.sessions.get(deviceId);
    }

    /**
     * Remueve la sesión cuando el socket se cierra
     */
    public remove(socket: BunDeviceSocket): void {
        if (socket.data.deviceId) {
            const existing = this.sessions.get(socket.data.deviceId);
            // Evita eliminar una reconexión más nueva si el socket anterior cerró tarde
            if (existing === socket) {
                this.sessions.delete(socket.data.deviceId);
            }
        }
    }

    /**
     * Envía un comando formateado [MANUFACTURER*ID*LEN*CONTENT] al reloj
     */
    public sendCommand(deviceId: string, commandContent: string): boolean {
        const socket = this.sessions.get(deviceId);
        if (!socket) return false;

        const manufacturer = socket.data.manufacturer ?? "3G";
        // Cálculo de longitud en 4 dígitos hexadecimales ASCII
        const lenHex = commandContent.length.toString(16).toUpperCase().padStart(4, "0");
        const frame = `[${manufacturer}*${deviceId}*${lenHex}*${commandContent}]`;

        socket.write(frame);
        return true;
    }

    /**
     * Comprueba si el dispositivo está actualmente conectado
     */
    public isOnline(deviceId: string): boolean {
        return this.sessions.has(deviceId);
    }

    /**
     * Closes and removes sessions that haven't sent a heartbeat within the threshold (in milliseconds)
     */
    public cleanupStaleSessions(maxIdleMs: number): void {
        const now = Date.now();
        for (const [deviceId, socket] of this.sessions.entries()) {
            const lastHeartbeat = socket.data.lastHeartbeat?.getTime() || 0;
            const idleTime = now - lastHeartbeat;
            
            if (idleTime > maxIdleMs) {
                console.log(`[SessionStore] Closing stale session for device ${deviceId} (inactive for ${Math.round(idleTime / 1000)}s)`);
                // Calling end() triggers the socket 'close' event, executing cleanups automatically
                socket.end();
            }
        }
    }

    public get activeCount(): number {
        return this.sessions.size;
    }
}

export const sessionStore = new SessionStore();