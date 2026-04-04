/**
 * bridge/openclaw_client.mjs
 *
 * Implements the OpenClaw Gateway Protocol v3 properly:
 *
 * Step 1: WebSocket connect
 * Step 2: Send {"type":"req","id":"<uuid>","method":"connect","params":{...}}
 * Step 3: Receive {"type":"res","id":"<uuid>","ok":true,"payload":{...}}
 * Step 4: Send actual method calls as req frames
 * Step 5: Stream event frames back as newline-delimited JSON to stdout
 *
 * Usage: node openclaw_client.mjs '{"action":"BUY","ticker":"NVDA","amount_usd":4000,"run_id":"..."}'
 */
import { readFileSync }  from 'fs';
import { homedir }       from 'os';
import { join }          from 'path';
import { randomUUID }    from 'crypto';

// ── Config ──────────────────────────────────────────────────────
const configPath = join(homedir(), '.openclaw', 'openclaw.json');
let gatewayToken = '';
const wsUrl = process.env.OPENCLAW_WS || 'ws://127.0.0.1:18789';

try {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  gatewayToken = cfg?.gateway?.auth?.token || '';
} catch (e) {
  emit({ type: 'log', message: `openclaw.json read error: ${e.message}` });
}

// ── Trade from argv ─────────────────────────────────────────────
let trade;
try {
  trade = JSON.parse(process.argv[2] || '{}');
} catch (e) {
  emit({ type: 'error', message: `Invalid trade JSON: ${e.message}` });
  process.exit(1);
}
const { action, ticker, amount_usd, run_id } = trade;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ── Protocol helpers ────────────────────────────────────────────
function makeReq(method, params) {
  return JSON.stringify({ type: 'req', id: randomUUID(), method, params });
}

// Pending promises keyed by request id
const pending = new Map();

function sendReq(ws, method, params) {
  const id = randomUUID();
  const frame = JSON.stringify({ type: 'req', id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(frame);
  });
}

// ── Trade prompt ────────────────────────────────────────────────
const tradePrompt =
  `AuraTrade autonomous trading task:\n` +
  `${action} $${amount_usd} worth of ${ticker}.\n` +
  `Run the Analyst → Risk → Trader pipeline with ArmorClaw enforcement.\n` +
  `Run ID: ${run_id}`;

// ── Connect ─────────────────────────────────────────────────────
emit({
  type: 'agent_activity', agent: 'OpenClaw', status: 'connecting',
  message: `Connecting to OpenClaw gateway at ${wsUrl}...`,
});

const ws = new WebSocket(wsUrl);
let connectDone = false;
let timeoutId   = null;

ws.onopen = async () => {
  emit({
    type: 'agent_activity', agent: 'OpenClaw', status: 'running',
    message: 'WebSocket open — sending protocol connect frame...',
  });

  try {
    // ── Step 2: Send connect req frame ────────────────────────
    const connectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id:       'auratrade-gateway-client',
        mode:     'cli',
        version:  '2026.3.2',
        platform: process.platform,
      },
      token: gatewayToken || undefined,
    };

    const connectRes = await sendReq(ws, 'connect', connectParams);

    if (!connectRes?.ok) {
      emit({
        type: 'agent_activity', agent: 'System', status: 'error',
        message: `Gateway connect rejected: ${JSON.stringify(connectRes?.error)}`,
      });
      emit({ type: 'done', run_id, final_status: 'ERROR' });
      ws.close();
      return;
    }

    connectDone = true;
    emit({
      type: 'agent_activity', agent: 'OpenClaw', status: 'running',
      message: `Gateway authenticated — protocol v${connectRes.payload?.protocol ?? 3} ✅`,
    });

    // ── Step 4: Send the agent message ───────────────────────
    // Try "agent.send" method — common in OpenClaw SDK
    const sendParams = {
      message:        tradePrompt,
      idempotencyKey: run_id || randomUUID(),
      sessionKey:     `auratrade-${run_id}`,
    };

    // Fire off the agent call (don't await — events come as event frames)
    ws.send(JSON.stringify({
      type:   'req',
      id:     randomUUID(),
      method: 'agent.send',
      params: sendParams,
    }));

    emit({
      type: 'agent_activity', agent: 'OpenClaw', status: 'running',
      message: `Trade command sent to OpenClaw agent pipeline: ${action} ${ticker} $${amount_usd}`,
    });

    // Safety timeout
    timeoutId = setTimeout(() => {
      emit({ type: 'done', run_id, final_status: 'TIMEOUT' });
      ws.close();
    }, 60_000);

  } catch (err) {
    emit({
      type: 'agent_activity', agent: 'System', status: 'error',
      message: `Connect error: ${err.message}`,
    });
    emit({ type: 'done', run_id, final_status: 'ERROR' });
    ws.close();
  }
};

ws.onmessage = (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  const t = msg.type || '';

  // ── Handle pending req → res ──────────────────────────────
  if (t === 'res' && msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve({ ok: msg.ok, payload: msg.payload, error: msg.error });
    return;
  }

  // ── Handle event frames ───────────────────────────────────
  if (t === 'event') {
    const ev = msg.event || '';

    if (ev === 'session.message' || ev === 'agent.message') {
      const content = msg.payload?.content || msg.payload?.message || '';
      emit({
        type: 'agent_activity',
        agent: msg.payload?.agentId || msg.payload?.agent || 'Agent',
        status: 'running',
        message: String(content).slice(0, 400),
      });
    }

    else if (ev === 'tool.call') {
      emit({
        type: 'agent_activity',
        agent: msg.payload?.agentId || 'Agent',
        status: 'running',
        message: `→ ${msg.payload?.tool || 'tool'}(${JSON.stringify(msg.payload?.params || {}).slice(0, 80)})`,
      });
    }

    else if (ev === 'armorclaw.decision' || ev === 'plugin.armorclaw.decision') {
      const d = msg.payload?.decision || msg.payload || {};
      emit({
        type:         'armorclaw_decision',
        decision:     d.verdict || d.decision || 'BLOCK',
        rule_id:      d.rule_id  || d.rules?.join(', '),
        block_reason: d.reason   || d.block_reason,
        check_number: d.check    || d.check_number,
        ticker, action, amount_usd, run_id,
      });
    }

    else if (ev === 'tool.result') {
      const tool = msg.payload?.tool || '';
      if (tool.toLowerCase().includes('alpaca')) {
        emit({
          type: 'agent_activity', agent: 'TraderAgent', status: 'complete',
          message: `Alpaca: ${JSON.stringify(msg.payload?.result || {}).slice(0, 150)}`,
        });
      }
    }

    else if (ev === 'session.complete' || ev === 'agent.complete' || ev === 'done') {
      clearTimeout(timeoutId);
      emit({ type: 'done', run_id, final_status: 'COMPLETE', source: 'openclaw_live' });
      ws.close();
    }

    else if (ev === 'session.error' || ev === 'agent.error') {
      emit({
        type: 'agent_activity', agent: 'System', status: 'error',
        message: `OpenClaw: ${msg.payload?.error || msg.payload?.message || ev}`,
      });
      clearTimeout(timeoutId);
      emit({ type: 'done', run_id, final_status: 'ERROR' });
      ws.close();
    }

    // Log all unknown events for debugging
    else {
      emit({ type: 'log', raw_event: ev, payload_keys: Object.keys(msg.payload || {}) });
    }
    return;
  }

  // Log anything unexpected
  emit({ type: 'log', raw_type: t });
};

ws.onerror = (err) => {
  clearTimeout(timeoutId);
  emit({ type: 'error', message: `WebSocket error: ${err?.message || String(err)}` });
  emit({ type: 'done', run_id, final_status: 'ERROR' });
};

ws.onclose = (event) => {
  clearTimeout(timeoutId);
  // Resolve any still-pending requests as errors
  for (const [id, { reject }] of pending) {
    reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`));
    pending.delete(id);
  }
  if (!connectDone || event.code !== 1000) {
    emit({
      type: 'agent_activity', agent: 'System', status: 'error',
      message: `Gateway closed: code=${event.code} reason="${event.reason}"`,
    });
    emit({ type: 'done', run_id, final_status: 'ERROR' });
  }
};
