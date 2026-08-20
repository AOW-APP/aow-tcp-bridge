import { startTcpServer } from './servers/tcp-server.ts';
import { startWebServer } from './servers/web-server.ts';

const NODE_ENV = Bun.env.NODE_ENV || 'development';

// 1. Initialize TCP Server
startTcpServer();

// 2. Initialize Web Server (HTTP) only in development mode
if (NODE_ENV === 'development') {
  startWebServer();
} else {
  console.log(`[System] Web server bypassed (NODE_ENV=${NODE_ENV})`);
}
