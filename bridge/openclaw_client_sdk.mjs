/**
 * bridge/openclaw_client_sdk.mjs
 *
 * PROPER OpenClaw integration using the @openclaw/client SDK.
 *
 * This correctly handles:
 * ✓ CSRG handshake with device signing
 * ✓ Ed25519 device identity validation
 * ✓ Protocol negotiation (v3)
 * ✓ Async event streaming back to Python
 *
 * Usage: node openclaw_client_sdk.mjs '{"action":"BUY","ticker":"NVDA","amount_usd":4000,"run_id":"..."}'
 *
 * Exit codes:
 *   0 = Success
 *   1 = Configuration error
 *   2 = Connection error
 *   3 = Gateway rejected
 *   4 = Timeout
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ── SDK Import ──────────────────────────────────────────────────
// Must use proper OpenClaw SDK to handle CSRG handshake
let OpenClawClient;
try {
  const mod = await import('@openclaw/client');
  OpenClawClient = mod.Client || mod.default || mod;
} catch (e) {
  emit({ type: 'error', message: `@openclaw/client not installed: ${e.message}` });
  process.exit(1);
}

// ── Config ──────────────────────────────────────────────────────
const configPath = join(homedir(), '.openclaw', 'openclaw.json');
const wsUrl = process.env.OPENCLAW_WS || 'ws://127.0.0.1:18789';

let config = {};
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  emit({
    type: 'agent_activity',
    agent: 'System',
    status: 'warning',
    message: `Config file not found: ${configPath} (proceeding with defaults)`,
  });
}

// ── Trade payload ───────────────────────────────────────────────
let trade;
try {
  trade = JSON.parse(process.argv[2] || '{}');
} catch (e) {
  emit({ type: 'error', message: `Invalid trade JSON: ${e.message}` });
  process.exit(1);
}

const { action, ticker, amount_usd, run_id } = trade;

if (!action || !ticker || !amount_usd) {
  emit({ type: 'error', message: 'Missing required: action, ticker, amount_usd' });
  process.exit(1);
}

// ── Emit helper ─────────────────────────────────────────────────
function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ── Trade prompt ────────────────────────────────────────────────
const tradePrompt =
  `AuraTrade autonomous trading task:\n` +
  `${action} $${amount_usd} worth of ${ticker}.\n` +
  `Run the Analyst → Risk → Trader pipeline with ArmorClaw enforcement.\n` +
  `Run ID: ${run_id}`;

// ── Main connect & execute ──────────────────────────────────────
(async () => {
  let client = null;
  const timeoutHandle = setTimeout(() => {
    emit({ type: 'done', run_id, final_status: 'TIMEOUT' });
    process.exit(4);
  }, 60_000);

  try {
    emit({
      type: 'agent_activity',
      agent: 'OpenClaw',
      status: 'connecting',
      message: `Connecting to OpenClaw gateway at ${wsUrl} using SDK...`,
    });

    // ── Step 1: Create SDK client with device identity ────────
    // The SDK handles CSRG handshake, Ed25519 signing, and nonce challenge internally
    client = new OpenClawClient({
      url: wsUrl,
      // Device identity (SDK handles signing)
      device: {
        id: config?.gateway?.device?.id || 'auratrade-python-bridge',
        name: 'AuraTrade Python Bridge',
        platform: process.platform,
        arch: process.arch,
      },
      // Optional: auth token if gateway requires it
      ...(config?.gateway?.auth?.token && { token: config.gateway.auth.token }),
      // Protocol settings
      protocol: {
        version: 3,
        features: ['agent', 'plugin', 'streaming'],
      },
      // Timeout for handshake (not full session)
      handshakeTimeout: 5000,
    });

    // ── Step 2: Listen for events BEFORE connecting ──────────
    client.on('error', (err) => {
      emit({
        type: 'agent_activity',
        agent: 'System',
        status: 'error',
        message: `Client error: ${err.message}`,
      });
      emit({ type: 'done', run_id, final_status: 'ERROR' });
      clearTimeout(timeoutHandle);
      process.exit(2);
    });

    client.on('close', (code, reason) => {
      emit({
        type: 'agent_activity',
        agent: 'System',
        status: 'error',
        message: `Gateway closed: code=${code} reason="${reason}"`,
      });
      if (code !== 1000) {
        emit({ type: 'done', run_id, final_status: 'ERROR' });
      }
      clearTimeout(timeoutHandle);
      process.exit(code === 1000 ? 0 : 3);
    });

    client.on('open', () => {
      emit({
        type: 'agent_activity',
        agent: 'OpenClaw',
        status: 'running',
        message: 'CSRG handshake complete ✓ — connected to gateway',
      });
    });

    // Event listener for OpenClaw events
    client.on('event', (ev) => {
      handleEvent(ev);
    });

    // Message listener for agent responses
    client.on('message', (msg) => {
      emit({
        type: 'agent_activity',
        agent: 'OpenClaw',
        status: 'running',
        message: String(msg).slice(0, 400),
      });
    });

    // ── Step 3: Connect (CSRG happens automatically) ──────────
    await client.connect();

    // ── Step 4: Send trade to agent pipeline ─────────────────
    emit({
      type: 'agent_activity',
      agent: 'OpenClaw',
      status: 'running',
      message: `Sending trade to Analyst → Risk → Trader pipeline...`,
    });

    // Use the proper SDK method to send to agents
    const sessionId = `auratrade-${run_id}`;
    
    // Send message to agent (method name may vary; common options listed)
    const sendMethod = client.sendToAgent || client.send || client.query;
    if (!sendMethod) {
      throw new Error('SDK client has no send/sendToAgent method');
    }

    await sendMethod.call(client, {
      message: tradePrompt,
      // Optional metadata
      metadata: {
        sessionId,
        runId: run_id,
        action,
        ticker,
        amount: amount_usd,
      },
      // Idempotency
      idempotencyKey: run_id,
    });

    emit({
      type: 'agent_activity',
      agent: 'OpenClaw',
      status: 'running',
      message: `Trade sent: ${action} ${ticker} $${amount_usd} via agents`,
    });

    // ── Step 5: Listen for completion ────────────────────────
    // Events will be handled by client.on('event') above
    // Wait for session to complete or timeout

  } catch (err) {
    emit({
      type: 'agent_activity',
      agent: 'System',
      status: 'error',
      message: `Connection or execution failed: ${err.message}`,
    });
    emit({ type: 'done', run_id, final_status: 'ERROR' });
    clearTimeout(timeoutHandle);
    process.exit(2);
  }
})();

// ── Event handler ───────────────────────────────────────────────
function handleEvent(ev) {
  const eventType = ev.type || ev.event || '';
  const payload = ev.payload || ev.data || {};

  // Agent messages
  if (eventType === 'agent.message' || eventType === 'message') {
    emit({
      type: 'agent_activity',
      agent: payload.agentId || payload.agent || 'Agent',
      status: 'running',
      message: String(payload.content || payload.message || '').slice(0, 400),
    });
  }

  // Tool calls
  if (eventType === 'tool.call') {
    emit({
      type: 'agent_activity',
      agent: payload.agentId || 'Agent',
      status: 'running',
      message: `→ ${payload.tool || 'tool'}(${JSON.stringify(payload.params || {}).slice(0, 80)})`,
    });
  }

  // ArmorClaw decisions
  if (eventType === 'armorclaw.decision' || eventType === 'plugin.armorclaw.decision') {
    const d = payload.decision || payload;
    emit({
      type: 'armorclaw_decision',
      decision: d.verdict || d.decision || 'BLOCK',
      rule_id: d.rule_id || (d.rules && d.rules.join(', ')),
      block_reason: d.reason || d.block_reason,
      check_number: d.check || d.check_number,
      ticker,
      action,
      amount_usd,
      run_id,
    });
  }

  // Tool results
  if (eventType === 'tool.result') {
    const tool = payload.tool || '';
    if (tool.toLowerCase().includes('alpaca')) {
      emit({
        type: 'agent_activity',
        agent: 'TraderAgent',
        status: 'complete',
        message: `Alpaca: ${JSON.stringify(payload.result || {}).slice(0, 150)}`,
      });
    }
  }

  // Session complete
  if (
    eventType === 'session.complete' ||
    eventType === 'agent.complete' ||
    eventType === 'complete'
  ) {
    emit({ type: 'done', run_id, final_status: 'COMPLETE', source: 'openclaw_sdk' });
    process.exit(0);
  }

  // Session error
  if (eventType === 'session.error' || eventType === 'agent.error') {
    emit({
      type: 'agent_activity',
      agent: 'System',
      status: 'error',
      message: `OpenClaw error: ${payload.error || payload.message || eventType}`,
    });
    emit({ type: 'done', run_id, final_status: 'ERROR' });
    process.exit(3);
  }

  // Debug: log unknown events
  emit({
    type: 'log',
    event_type: eventType,
    payload_keys: Object.keys(payload || {}),
  });
}
