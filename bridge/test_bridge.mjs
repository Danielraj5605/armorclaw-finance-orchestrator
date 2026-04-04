import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const testTrade = JSON.stringify({action:'BUY',ticker:'BTC/USD',amount_usd:1000,run_id:'test-123'});

// Dynamically import and run the bridge
import { spawnSync } from 'child_process';
const result = spawnSync('node', ['bridge/openclaw_client.mjs', testTrade], {
  encoding: 'utf8', timeout: 15000, stdio: 'inherit'
});
console.log('Exit:', result.status, result.stderr?.slice(0,200));
