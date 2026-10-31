import { loadConfig } from '@strata/config';
import { GatewayServer } from './gateway-server.js';

const config = loadConfig();
const gateway = new GatewayServer({
  port: config.GATEWAY_PORT
});

console.log(`🌐 Strata WebSocket Gateway port ${config.GATEWAY_PORT} uzerinde dinliyor.`);

process.on('SIGTERM', async () => {
  console.log('SIGTERM alindi, Gateway zarifce kapatiliyor...');
  await gateway.close();
  process.exit(0);
});
