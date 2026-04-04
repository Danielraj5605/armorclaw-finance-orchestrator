#!/usr/bin/env node
/**
 * bridge/test_openclaw_sdk.mjs
 *
 * Test script to verify OpenClaw SDK integration works correctly.
 * Tests CSRG handshake, connection, and trade execution.
 *
 * Run: node test_openclaw_sdk.mjs
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

const tests = [];
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(color, label, message) {
  console.log(`${colors[color]}${label}${colors.reset} ${message}`);
}

function pass(message) {
  log('green', '✓', message);
}

function fail(message) {
  log('red', '✗', message);
}

function info(message) {
  log('cyan', 'ℹ', message);
}

function warn(message) {
  log('yellow', '⚠', message);
}

// ── Test 1: Node.js version ─────────────────────────────────────
tests.push({
  name: 'Node.js Version',
  async run() {
    const version = process.version;
    const major = parseInt(version.slice(1));
    if (major >= 18) {
      pass(`Node.js ${version} (required >=18.0.0)`);
      return true;
    } else {
      fail(`Node.js ${version} (required >=18.0.0)`);
      return false;
    }
  },
});

// ── Test 2: Check openclaw.json ──────────────────────────────────
tests.push({
  name: 'OpenClaw Config (~/.openclaw/openclaw.json)',
  async run() {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) {
      fail(`Config not found at ${configPath}`);
      info('Run: mkdir -p ~/.openclaw && cp config/openclaw.json.example ~/.openclaw/openclaw.json');
      return false;
    }
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      pass(`Config loaded (device: ${config?.gateway?.device?.id || 'default'})`);
      return true;
    } catch (e) {
      fail(`Config is invalid JSON: ${e.message}`);
      return false;
    }
  },
});

// ── Test 3: Check @openclaw/client SDK ──────────────────────────
tests.push({
  name: '@openclaw/client SDK',
  async run() {
    try {
      await import('@openclaw/client');
      pass('SDK is installed');
      return true;
    } catch (e) {
      fail('SDK not found. Run: npm install @openclaw/client');
      return false;
    }
  },
});

// ── Test 4: Test gateway connectivity ────────────────────────────
tests.push({
  name: 'Gateway Connectivity',
  async run() {
    return new Promise((resolve) => {
      const url = process.env.OPENCLAW_WS || 'ws://127.0.0.1:18789';
      info(`Testing connection to ${url}...`);

      const timeout = setTimeout(() => {
        fail(`Timeout connecting to ${url}`);
        fail('Is the OpenClaw gateway running?');
        resolve(false);
      }, 5000);

      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          clearTimeout(timeout);
          pass(`Connected to ${url}`);
          ws.close();
          resolve(true);
        };
        ws.onerror = (err) => {
          clearTimeout(timeout);
          fail(`Connection error: ${err?.message || 'unknown'}`);
          resolve(false);
        };
      } catch (e) {
        clearTimeout(timeout);
        fail(`WebSocket error: ${e.message}`);
        resolve(false);
      }
    });
  },
});

// ── Test 5: Test SDK bridge script ───────────────────────────────
tests.push({
  name: 'SDK Bridge Script (openclaw_client_sdk.mjs)',
  async run() {
    return new Promise((resolve) => {
      const testTrade = JSON.stringify({
        action: 'BUY',
        ticker: 'TEST/USD',
        amount_usd: 100,
        run_id: `test-${Date.now()}`,
      });

      info('Running: node openclaw_client_sdk.mjs (test trade)');

      const proc = spawn('node', ['openclaw_client_sdk.mjs', testTrade], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });

      let eventCount = 0;
      let handshakeSuccess = false;
      let hasError = false;

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l) => l.trim());
        lines.forEach((line) => {
          try {
            const msg = JSON.parse(line);
            eventCount++;

            // Check for handshake success
            if (
              msg.message &&
              msg.message.includes('CSRG handshake complete')
            ) {
              handshakeSuccess = true;
            }

            // Log first few events
            if (eventCount <= 2) {
              info(`Event ${eventCount}: ${msg.message || msg.type}`);
            }
          } catch (e) {
            // Non-JSON output
          }
        });
      });

      proc.stderr.on('data', (data) => {
        hasError = true;
        fail(`stderr: ${data.toString().slice(0, 100)}`);
      });

      proc.on('close', (code) => {
        if (handshakeSuccess && !hasError && code === 0) {
          pass(`CSRG handshake successful (${eventCount} events streamed)`);
          resolve(true);
        } else if (code === 2 && !handshakeSuccess) {
          fail('Gateway unreachable (is it running on port 18789?)');
          resolve(false);
        } else if (code === 3) {
          fail('Gateway rejected (CSRG handshake failed)');
          resolve(false);
        } else {
          fail(`Bridge exited with code ${code}`);
          resolve(false);
        }
      });
    });
  },
});

// ── Run all tests ────────────────────────────────────────────────
(async () => {
  console.log(
    `\n${colors.cyan}${colors.bright}OpenClaw SDK Integration Tests${colors.reset}\n`
  );

  let passCount = 0;
  let failCount = 0;

  for (const test of tests) {
    console.log(`${colors.bright}${test.name}${colors.reset}`);
    try {
      const result = await test.run();
      if (result) passCount++;
      else failCount++;
    } catch (e) {
      fail(e.message);
      failCount++;
    }
    console.log('');
  }

  const total = passCount + failCount;
  const pct = Math.round((passCount / total) * 100);

  if (failCount === 0) {
    log(
      'green',
      '✓',
      `All tests passed! (${passCount}/${total}) - Ready to use.`
    );
    process.exit(0);
  } else {
    log(
      'red',
      '✗',
      `${failCount} test(s) failed (${passCount}/${total}, ${pct}%)`
    );
    info('\nSetup checklist:');
    if (process.version < 'v18') {
      info('  1. Upgrade Node.js to >=18.0.0');
    }
    if (!existsSync(join(homedir(), '.openclaw', 'openclaw.json'))) {
      info('  2. Create ~/.openclaw/openclaw.json');
    }
    try {
      await import('@openclaw/client');
    } catch {
      info('  3. Install SDK: npm install @openclaw/client');
    }
    info('  4. Start OpenClaw gateway: openclaw daemon start');
    process.exit(1);
  }
})();
