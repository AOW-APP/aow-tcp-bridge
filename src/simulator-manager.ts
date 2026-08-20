import type { Socket } from "bun";

// Helper para calcular la longitud del comando en hexadecimal (4 caracteres)
function getHexLength(content: string): string {
  const len = content.length.toString(16).toUpperCase();
  return len.padStart(4, '0');
}

// Helper para construir tramas del protocolo
function buildFrame(imei: string, data: string): string {
  const lengthHex = getHexLength(data);
  return `[3G*${imei}*${lengthHex}*${data}]`;
}

interface SimulatedDevice {
  imei: string;
  alias: string;
  connected: boolean;
  socket?: Socket<any>;
}

// Almacén en memoria de simuladores activos
const simulators = new Map<string, SimulatedDevice>();

export const SimulatorManager = {
  getSimulators() {
    return Array.from(simulators.values()).map(sim => ({
      imei: sim.imei,
      alias: sim.alias,
      connected: sim.connected
    }));
  },

  createSimulator(imei: string, alias: string) {
    if (simulators.has(imei)) {
      throw new Error('Ya existe un simulador con este IMEI.');
    }
    
    const newSim: SimulatedDevice = {
      imei,
      alias,
      connected: false
    };
    
    simulators.set(imei, newSim);
    this.connectSimulator(imei);
  },

  connectSimulator(imei: string) {
    const sim = simulators.get(imei);
    if (!sim || sim.connected) return;

    const hostname = Bun.env.SOCKET_HOST || '127.0.0.1';
    const port = parseInt(Bun.env.SOCKET_PORT || '9001', 10);

    Bun.connect({
      hostname,
      port,
      socket: {
        open(socket) {
          console.log(`[Simulator] ${sim.alias} (${sim.imei}) conectado al puerto TCP ${port}`);
          sim.connected = true;
          sim.socket = socket;
          
          // Enviar latido inicial al conectar
          const lkFrame = buildFrame(sim.imei, 'LK');
          socket.write(lkFrame);
        },
        data(socket, data) {
          console.log(`[Simulator] ${sim.alias} recibió datos del servidor: ${data.toString().trim()}`);
        },
        close(socket) {
          console.log(`[Simulator] ${sim.alias} se desconectó.`);
          sim.connected = false;
          sim.socket = undefined;
        },
        error(socket, err) {
          console.error(`[Simulator] Error en ${sim.alias}:`, err.message);
          sim.connected = false;
          sim.socket = undefined;
        }
      }
    });
  },

  disconnectSimulator(imei: string) {
    const sim = simulators.get(imei);
    if (sim && sim.socket) {
      sim.socket.end();
      sim.connected = false;
      sim.socket = undefined;
    }
  },

  toggleSimulator(imei: string) {
    const sim = simulators.get(imei);
    if (!sim) return;
    if (sim.connected) {
      this.disconnectSimulator(imei);
    } else {
      this.connectSimulator(imei);
    }
  },

  deleteSimulator(imei: string) {
    this.disconnectSimulator(imei);
    simulators.delete(imei);
  },

  sendEvent(imei: string, eventType: string) {
    const sim = simulators.get(imei);
    if (!sim || !sim.connected || !sim.socket) {
      throw new Error('Dispositivo no conectado.');
    }

    let payload = '';
    const dStr = '190826'; // YYMMDD
    const tStr = '180000'; // HHMMSS

    switch (eventType) {
      case 'LK':
        payload = 'LK,95,85,1000';
        break;
      case 'UD':
        payload = `UD,${dStr},${tStr},A,19.4326,N,099.1332,W,0.0,0.0,2240,8,95,85,2500,0`;
        break;
      case 'LBS':
        payload = 'LBS,214,7,1705,13523,80';
        break;
      case 'WIFI':
        payload = `WIFI,${dStr},${tStr},00:11:22:33:44:55,-70,66:77:88:99:AA:BB,-85`;
        break;
      case 'bphrt':
        payload = 'bphrt,75,120,80';
        break;
      case 'oxygen':
        payload = 'oxygen,98';
        break;
      case 'btemp2':
        payload = 'btemp2,36.5';
        break;
      case 'FALL':
        payload = 'FALL';
        break;
      case 'REMOVE':
        payload = 'REMOVE';
        break;
      case 'AL':
        payload = `AL,${dStr},${tStr},A,19.4326,N,099.1332,W,0.0,0.0,2240,8,95,85,2500,0`;
        break;
      default:
        payload = 'LK';
    }

    const frame = buildFrame(sim.imei, payload);
    console.log(`[Simulator] Enviando evento manual: ${frame}`);
    sim.socket.write(frame);
  }
};
