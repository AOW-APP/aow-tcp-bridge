// Configuración del simulador
const TCP_HOST = process.env.SOCKET_HOST || '127.0.0.1';
const TCP_PORT = parseInt(process.env.SOCKET_PORT || '9001', 10);
const DEFAULT_IMEI = '123456789012345';

console.log(`[Simulator] Iniciando simulador completo de dispositivo IoT (4P-Touch)...`);

function getHexLength(content: string): string {
  const len = content.length.toString(16).toUpperCase();
  return len.padStart(4, '0');
}

function buildFrame(imei: string, data: string): string {
  const lengthHex = getHexLength(data);
  return `[3G*${imei}*${lengthHex}*${data}]`;
}

// Conectar al Servidor TCP usando Bun.connect nativo
Bun.connect({
  hostname: TCP_HOST,
  port: TCP_PORT,
  socket: {
    open(socket) {
      console.log(`[Simulator] Conectado al servidor TCP en ${TCP_HOST}:${TCP_PORT}`);

      // 1. Enviar latido inicial (LK)
      const lkFrame = buildFrame(DEFAULT_IMEI, 'LK,95,85,1230');
      console.log(`[Simulator] 1. Enviando LK (Latido + Batería + Pasos): ${lkFrame}`);
      socket.write(lkFrame);

      // 2. Enviar reporte de ubicación GPS (UD)
      setTimeout(() => {
        const udData = 'UD,190826,180400,A,19.4326,N,099.1332,W,0.0,0.0,2240,8,95,85,1240,0';
        const udFrame = buildFrame(DEFAULT_IMEI, udData);
        console.log(`[Simulator] 2. Enviando ubicación GPS (UD): ${udFrame}`);
        socket.write(udFrame);
      }, 3000);

      // 3. Enviar reporte de localización LBS alternativa
      setTimeout(() => {
        const lbsData = 'LBS,214,7,1705,13523,80';
        const lbsFrame = buildFrame(DEFAULT_IMEI, lbsData);
        console.log(`[Simulator] 3. Enviando localización celular (LBS): ${lbsFrame}`);
        socket.write(lbsFrame);
      }, 6000);

      // 4. Enviar reporte de localización WiFi alternativa
      setTimeout(() => {
        const wifiData = 'WIFI,190826,180410,00:11:22:33:44:55,-70,66:77:88:99:AA:BB,-85';
        const wifiFrame = buildFrame(DEFAULT_IMEI, wifiData);
        console.log(`[Simulator] 4. Enviando localización WiFi (WIFI): ${wifiFrame}`);
        socket.write(wifiFrame);
      }, 9000);

      // 5. Enviar telemetría de salud (Signos Vitales)
      setTimeout(() => {
        const hrFrame = buildFrame(DEFAULT_IMEI, 'bphrt,78,120,80');
        console.log(`[Simulator] 5a. Enviando Ritmo Cardíaco / Presión (bphrt): ${hrFrame}`);
        socket.write(hrFrame);
      }, 12000);

      setTimeout(() => {
        const oxyFrame = buildFrame(DEFAULT_IMEI, 'oxygen,98');
        console.log(`[Simulator] 5b. Enviando Oxigenación en sangre (oxygen): ${oxyFrame}`);
        socket.write(oxyFrame);
      }, 14000);

      setTimeout(() => {
        const tempFrame = buildFrame(DEFAULT_IMEI, 'btemp2,36.6');
        console.log(`[Simulator] 5c. Enviando Temperatura Corporal (btemp2): ${tempFrame}`);
        socket.write(tempFrame);
      }, 16000);

      // 6. Enviar alertas especiales (Caída y Remoción)
      setTimeout(() => {
        const fallFrame = buildFrame(DEFAULT_IMEI, 'FALL');
        console.log(`[Simulator] 6a. Enviando alerta de caída (FALL): ${fallFrame}`);
        socket.write(fallFrame);
      }, 19000);

      setTimeout(() => {
        const removeFrame = buildFrame(DEFAULT_IMEI, 'REMOVE');
        console.log(`[Simulator] 6b. Enviando alerta de remoción (REMOVE): ${removeFrame}`);
        socket.write(removeFrame);
      }, 21000);

      // 7. Enviar alarma SOS final (AL)
      setTimeout(() => {
        const alData = 'AL,190826,180430,A,19.4326,N,099.1332,W,0.0,0.0,2240,8,95,80,1350,0';
        const alFrame = buildFrame(DEFAULT_IMEI, alData);
        console.log(`[Simulator] 7. Enviando Alarma SOS Crítica (AL): ${alFrame}`);
        socket.write(alFrame);
      }, 24000);
    },
    data(socket, data) {
      const serverMsg = data.toString();
      console.log(`[Simulator] Respuesta del servidor recibida: ${serverMsg.trim()}`);
    },
    close(socket) {
      console.log('[Simulator] Desconectado del servidor TCP.');
    },
    error(socket, err) {
      console.error('[Simulator] Error en la conexión:', err.message);
    }
  }
});
