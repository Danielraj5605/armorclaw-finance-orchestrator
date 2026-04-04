import { useState, useEffect, useRef, useCallback } from 'react'

const API = 'http://localhost:8000'

// ─── Design tokens (match landing page exactly) ───────────────
const card = {
  background: 'rgba(0, 245, 255, 0.04)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(0, 245, 255, 0.35)',
  boxShadow: '0 0 30px rgba(0, 245, 255, 0.15)',
  borderRadius: '16px',
  padding: '1.5rem',
}

const mono  = { fontFamily: "'JetBrains Mono', monospace" }
const head  = { fontFamily: "'Orbitron', monospace" }
const label = { fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#00f5ff', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '0.85rem', display: 'block' }

// ─── Panel 1: Trade Trigger ────────────────────────────────────
const ALLOWED_TICKERS = ['NVDA','AAPL','MSFT','GOOGL','AMZN','META','TSLA','BTC/USD','ETH/USD']

function parsePrompt(text) {
  const s = text.trim().toUpperCase()
  const actionMatch = s.match(/\b(BUY|SELL)\b/)
  if (!actionMatch) return null
  let ticker = null
  for (const t of ALLOWED_TICKERS) {
    if (s.includes(t)) { ticker = t; break }
  }
  if (!ticker) {
    const afterAction = s.slice(s.indexOf(actionMatch[1]) + actionMatch[1].length).trim()
    ticker = afterAction.split(/[\s$/,]+/)[0]
  }
  const amtMatch = s.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)/)
  if (!amtMatch) return null
  const amount = parseFloat(amtMatch[1].replace(/,/g, ''))
  if (!amount || amount <= 0) return null
  return { action: actionMatch[1], ticker, amount_usd: amount }
}

function TradeTrigger({ onRunStart, running }) {
  const [prompt, setPrompt] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error,  setError]  = useState(null)

  function handleChange(val) {
    setPrompt(val)
    setError(null)
    setParsed(parsePrompt(val))
  }

  async function triggerTrade(action, ticker, amount_usd) {
    setError(null)
    if (!action || !ticker || !amount_usd) return setError('Could not parse — try: "BUY NVDA $4000"')
    try {
      const res = await fetch(`${API}/run-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ticker: ticker.trim().toUpperCase(), amount_usd }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      onRunStart(data.run_id)
      setPrompt(''); setParsed(null)
    } catch (e) {
      setError(`Backend not reachable: ${e.message}. Start FastAPI on port 8000.`)
    }
  }

  function onSubmit() {
    if (!parsed) return setError('Could not parse — try: "BUY NVDA $4000" or "SELL TSLA 3000"')
    triggerTrade(parsed.action, parsed.ticker, parsed.amount_usd)
  }

  const isReady = !!parsed && !running

  return (
    <div style={{ ...card, marginBottom: '1.5rem' }}>
      <span style={label}>Trade Command</span>

      {/* ── Natural language prompt bar ── */}
      <div style={{ marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={prompt}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isReady && onSubmit()}
              placeholder='Type a trade — e.g. "BUY NVDA $4000"  or  "SELL TSLA 3000"  or  "BUY BTC/USD 1500"'
              disabled={running}
              style={{
                width: '100%', padding: '0.95rem 1rem 0.95rem 2.8rem',
                borderRadius: '10px', boxSizing: 'border-box',
                background: 'rgba(0,245,255,0.05)',
                border: `1px solid ${parsed ? 'rgba(0,245,255,0.65)' : 'rgba(0,245,255,0.25)'}`,
                color: '#f0f0f8', ...mono, fontSize: '0.9rem', outline: 'none',
                boxShadow: parsed ? '0 0 18px rgba(0,245,255,0.12)' : 'none',
                transition: 'all 0.2s',
              }}
            />
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }}>⌨</span>
          </div>
          <button
            disabled={!isReady}
            onClick={onSubmit}
            style={{
              padding: '0.95rem 1.6rem', borderRadius: '10px',
              background: isReady ? 'rgba(0,245,255,0.15)' : 'rgba(0,245,255,0.04)',
              border: `1px solid ${isReady ? 'rgba(0,245,255,0.6)' : 'rgba(0,245,255,0.15)'}`,
              color: isReady ? 'var(--cyan)' : 'rgba(0,245,255,0.3)',
              ...head, fontSize: '0.75rem', letterSpacing: '0.06em',
              cursor: isReady ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap',
              boxShadow: isReady ? '0 0 20px rgba(0,245,255,0.2)' : 'none',
            }}>
            {running ? <Spinner color="var(--cyan)" size={14} /> : '▶ Execute'}
          </button>
        </div>

        {/* Live parse preview */}
        {parsed && (
          <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...mono, fontSize: '0.6rem', color: '#607080' }}>Parsed →</span>
            <Tag color={parsed.action === 'BUY' ? '#00ff88' : '#ff5555'}>{parsed.action}</Tag>
            <Tag color="var(--cyan)">{parsed.ticker}</Tag>
            <Tag color="#fbbf24">${parsed.amount_usd?.toLocaleString()}</Tag>
            <span style={{ ...mono, fontSize: '0.58rem', color: '#354555' }}>← press Enter or Execute</span>
          </div>
        )}

        <div style={{ marginTop: '0.55rem', ...mono, fontSize: '0.58rem', color: '#354555' }}>
          Authorized: {ALLOWED_TICKERS.join(' · ')}
        </div>
      </div>

      {/* ── Quick presets ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {[
          { label: '✅ BUY NVDA $4K',      action:'BUY', ticker:'NVDA',    amt:4000, c:'#00ff88' },
          { label: '🚫 BUY NVDA $8K',      action:'BUY', ticker:'NVDA',    amt:8000, c:'#ff5555' },
          { label: '₿  BUY BTC/USD $1.5K', action:'BUY', ticker:'BTC/USD', amt:1500, c:'#fbbf24' },
          { label: '📈 BUY TSLA $2K',      action:'BUY', ticker:'TSLA',    amt:2000, c:'#a78bfa' },
        ].map(({ label: lbl, action, ticker, amt, c }) => (
          <button key={lbl} disabled={running} onClick={() => triggerTrade(action, ticker, amt)}
            style={{
              flex: '1 1 160px', padding: '0.8rem 1rem',
              background: running ? `${c}08` : `${c}12`,
              border: `1px solid ${c}66`, color: running ? `${c}44` : c,
              borderRadius: '9px', cursor: running ? 'not-allowed' : 'pointer',
              ...head, fontSize: '0.68rem', letterSpacing: '0.04em', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}
            onMouseEnter={e => { if (!running) e.currentTarget.style.boxShadow = `0 0 25px ${c}30` }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
            {running ? <Spinner color={c} size={12} /> : lbl}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '8px', ...mono, fontSize: '0.75rem', color: '#ff8888' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  )
}

function Tag({ color, children }) {
  return (
    <span style={{ ...mono, fontSize: '0.68rem', padding: '0.18rem 0.55rem', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}44` }}>
      {children}
    </span>
  )
}

// ─── Panel 2: Agent Activity Feed ─────────────────────────────
function AgentFeed({ runId, onDecision, onStreamEnd }) {
  const [events, setEvents] = useState([])
  const [streamStatus, setStreamStatus] = useState('idle') // idle | streaming | complete | error
  const esRef = useRef(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!runId) return
    setEvents([])
    setStreamStatus('streaming')

    const es = new EventSource(`${API}/run-trade/stream/${runId}`)
    esRef.current = es

    es.addEventListener('agent_activity', e => {
      const data = JSON.parse(e.data)
      setEvents(prev => [...prev, { type: 'agent', ...data, ts: new Date().toISOString() }])
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    })

    es.addEventListener('armorclaw_decision', e => {
      const data = JSON.parse(e.data)
      setEvents(prev => [...prev, { type: 'decision', ...data, ts: new Date().toISOString() }])
      onDecision(data)
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    })

    es.addEventListener('done', () => {
      setStreamStatus('complete')
      es.close()
      onStreamEnd()
    })

    es.onerror = () => {
      setStreamStatus('error')
      es.close()
      onStreamEnd()
    }

    return () => { es.close() }
  }, [runId])

  const agentColor = {
    AnalystAgent: '#38bdf8',
    RiskAgent:    '#fbbf24',
    TraderAgent:  '#a78bfa',
    ArmorClaw:    null, // set by decision
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={label}>Live Agent Activity</span>
        <StatusBadge status={streamStatus} />
      </div>

      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: '260px', maxHeight: '340px' }}>
        {events.length === 0 ? (
          <EmptyState text="No trades yet — click Run Allowed Trade to begin" icon="🤖" />
        ) : events.map((ev, i) => (
          <div key={i} style={{
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
            padding: '0.6rem 0.8rem', borderRadius: '8px',
            background: ev.type === 'decision'
              ? (ev.decision === 'ALLOW' ? 'rgba(0,255,136,0.06)' : 'rgba(255,80,80,0.06)')
              : 'rgba(255,255,255,0.02)',
            borderLeft: `3px solid ${ev.type === 'decision' ? (ev.decision === 'ALLOW' ? '#00ff88' : '#ff5555') : (agentColor[ev.agent] || 'var(--cyan)') }`,
            animation: 'fadeUp 0.3s ease',
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
              {ev.type === 'decision' ? (ev.decision === 'ALLOW' ? '✅' : '🚫') :
               ev.agent === 'AnalystAgent' ? '🔍' :
               ev.agent === 'RiskAgent'    ? '🛡️' :
               ev.agent === 'TraderAgent'  ? '⚡' : '⚙️'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...head, fontSize: '0.65rem', color: ev.type === 'decision' ? (ev.decision === 'ALLOW' ? '#00ff88' : '#ff5555') : (agentColor[ev.agent] || 'var(--cyan)'), letterSpacing: '0.05em' }}>
                  {ev.agent || (ev.type === 'decision' ? 'ArmorClaw' : '—')}
                </span>
                <span style={{ ...mono, fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>{ev.ts?.slice(11,19)}</span>
              </div>
              <p style={{ ...mono, fontSize: '0.75rem', color: '#d0d8e0', marginTop: '0.2rem', lineHeight: 1.4 }}>
                {ev.message || (ev.type === 'decision' ? (ev.decision === 'ALLOW' ? `Order approved — ${ev.ticker} ${ev.action} $${ev.amount_usd}` : `Blocked: ${ev.rule_id}`) : '')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel 3: ArmorClaw Decision Card ─────────────────────────
function DecisionCard({ decision }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (decision) { setVisible(false); setTimeout(() => setVisible(true), 50) } }, [decision])

  if (!decision) return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState text="ArmorClaw verdict will appear here" icon="⚙️" />
    </div>
  )

  const isAllow = decision.decision === 'ALLOW'
  const accent = isAllow ? '#00ff88' : '#ff5555'
  const bg = isAllow ? 'rgba(0,255,136,0.05)' : 'rgba(255,80,80,0.05)'

  return (
    <div style={{
      ...card,
      background: bg, border: `1px solid ${accent}44`,
      boxShadow: `0 0 40px ${accent}22`,
      height: '100%', display: 'flex', flexDirection: 'column',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
    }}>
      <span style={label}>ArmorClaw Decision</span>
      <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div style={{ fontSize: '3.5rem' }}>{isAllow ? '✅' : '🚫'}</div>
        <div style={{ ...head, fontSize: '1.4rem', color: accent, letterSpacing: '0.08em', textShadow: `0 0 20px ${accent}88` }}>
          {isAllow ? 'ALLOW' : 'BLOCK'}
        </div>
        <p style={{ ...mono, fontSize: '0.78rem', color: isAllow ? '#00ff88' : '#ff8888', textAlign: 'center' }}>
          {isAllow ? 'Order approved and executed' : 'Order blocked by ArmorClaw'}
        </p>

        {isAllow && (
          <div style={{ width: '100%', background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: '10px', padding: '1rem' }}>
            {[
              ['Ticker',    decision.ticker],
              ['Action',    decision.action],
              ['Amount',    `$${decision.amount_usd?.toLocaleString()}`],
              ['Order ID',  decision.alpaca_order_id || 'alp-xxx-001'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '0.72rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(0,255,136,0.1)', color: '#d0d8e0' }}>
                <span style={{ color: '#8ab0c0' }}>{k}</span>
                <span style={{ color: '#00ff88' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {!isAllow && (
          <div style={{ width: '100%', background: 'rgba(255,80,80,0.07)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ ...mono, fontSize: '0.7rem', color: '#ff8888', marginBottom: '0.5rem' }}>Rules fired:</div>
            {(decision.rule_id || '').split(',').map((r, i) => r.trim() && (
              <div key={i} style={{ ...mono, fontSize: '0.68rem', color: '#ffaaaa', padding: '0.2rem 0' }}>• {r.trim()}</div>
            ))}
            <div style={{ marginTop: '0.75rem', ...mono, fontSize: '0.68rem', color: '#ff8888', lineHeight: 1.5 }}>
              {decision.block_reason}
            </div>
            <div style={{ marginTop: '0.75rem', ...mono, fontSize: '0.65rem', color: '#607080' }}>
              Failed at: Check {decision.check_number || 1} of 5
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Panel 4: Audit Log Table ─────────────────────────────────
function AuditLogTable({ refreshTick }) {
  const [logs,   setLogs]   = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(false)
  const [newRowId, setNewRowId] = useState(null)
  const prevCount = useRef(0)

  async function fetchLogs() {
    setLoading(true)
    try {
      const q = filter !== 'ALL' ? `?decision=${filter}&limit=20` : '?limit=20'
      const res = await fetch(`${API}/get-logs${q}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const entries = data.entries || []
      if (entries.length > prevCount.current) {
        setNewRowId(entries[0]?.id)
        setTimeout(() => setNewRowId(null), 3000)
      }
      prevCount.current = entries.length
      setLogs(entries)
    } catch {
      // backend not running — show empty state
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [filter, refreshTick])

  useEffect(() => {
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [filter])

  const cols = ['Timestamp', 'Agent', 'Action', 'Ticker', 'Amount', 'Decision', 'Rule ID']

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={label}>Audit Log</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {loading && <Spinner color="var(--cyan)" size={14} />}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)', color: 'var(--cyan)', ...mono, fontSize: '0.72rem', padding: '0.35rem 0.7rem', borderRadius: '6px', cursor: 'pointer' }}>
            <option value="ALL">ALL</option>
            <option value="ALLOW">ALLOW only</option>
            <option value="BLOCK">BLOCK only</option>
          </select>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState text="No audit entries yet — run a trade to populate" icon="📋" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,245,255,0.2)' }}>
                {cols.map(c => (
                  <th key={c} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#8ab0c0', letterSpacing: '0.05em', fontWeight: 400 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const isAllow = log.decision === 'ALLOW'
                const isNew   = log.id === newRowId
                return (
                  <tr key={log.id} style={{
                    borderLeft: `3px solid ${isAllow ? '#00ff88' : '#ff5555'}`,
                    background: isNew ? (isAllow ? 'rgba(0,255,136,0.08)' : 'rgba(255,80,80,0.08)') : 'transparent',
                    boxShadow: isNew ? (isAllow ? '0 0 20px rgba(0,255,136,0.15)' : '0 0 20px rgba(255,80,80,0.15)') : 'none',
                    transition: 'background 1s ease, box-shadow 1s ease',
                  }}>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#8ab0c0' }}>{log.timestamp?.slice(0,19).replace('T',' ')}</td>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#d0d8e0' }}>{log.agent}</td>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#d0d8e0' }}>{log.action}</td>
                    <td style={{ padding: '0.5rem 0.6rem', color: 'var(--cyan)' }}>{log.ticker}</td>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#d0d8e0' }}>${(log.amount_usd||0).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>
                      <span style={{ color: isAllow ? '#00ff88' : '#ff5555', fontWeight: 700 }}>{log.decision}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem', color: '#ff9999', fontSize: '0.65rem' }}>{log.rule_id || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Panel 5: Portfolio Positions ─────────────────────────────
function PositionsPanel({ refreshTick }) {
  const [positions, setPositions] = useState([])
  const [equity,    setEquity]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  async function fetchPositions() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/get-positions`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPositions(data.positions || [])
      setEquity(data.total_equity)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch {
      // backend not running
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchPositions() }, [refreshTick])
  useEffect(() => {
    const id = setInterval(fetchPositions, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={label}>Portfolio</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lastUpdate && <span style={{ ...mono, fontSize: '0.62rem', color: '#607080' }}>Updated {lastUpdate}</span>}
          {loading ? <Spinner color="var(--cyan)" size={14} /> : (
            <button onClick={fetchPositions} style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)', color: 'var(--cyan)', ...mono, fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: '6px', cursor: 'pointer' }}>↻ Refresh</button>
          )}
        </div>
      </div>

      {equity && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,245,255,0.05)', borderRadius: '10px', marginBottom: '1rem', border: '1px solid rgba(0,245,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: '0.7rem', color: '#8ab0c0' }}>Total Equity</span>
          <span style={{ ...head, fontSize: '1.1rem', color: 'var(--cyan)', textShadow: '0 0 15px rgba(0,245,255,0.5)' }}>${parseFloat(equity).toLocaleString()}</span>
        </div>
      )}

      {positions.length === 0 ? (
        <EmptyState text="No positions yet — run a trade to see portfolio" icon="📈" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {positions.map(pos => {
            const pl = parseFloat(pos.unrealized_pl || 0)
            const isUp = pl >= 0
            return (
              <div key={pos.symbol} style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ ...head, fontSize: '1rem', color: 'var(--cyan)', letterSpacing: '0.06em' }}>{pos.symbol}</div>
                  <div style={{ ...mono, fontSize: '0.65rem', color: '#8ab0c0', marginTop: '0.15rem' }}>{pos.qty} shares @ ${parseFloat(pos.current_price || 0).toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...head, fontSize: '0.85rem', color: '#f0f0f8' }}>${parseFloat(pos.market_value || 0).toLocaleString()}</div>
                  <div style={{ ...mono, fontSize: '0.68rem', color: isUp ? '#00ff88' : '#ff5555', marginTop: '0.1rem' }}>
                    {isUp ? '▲' : '▼'} ${Math.abs(pl).toFixed(2)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Shared small components ───────────────────────────────────
function Spinner({ color = 'var(--cyan)', size = 16 }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
  )
}

function StatusBadge({ status }) {
  const map = {
    idle:      { color: '#607080',  text: '● Idle' },
    streaming: { color: '#fbbf24',  text: '● Streaming...', pulse: true },
    complete:  { color: '#00ff88',  text: '● Complete' },
    error:     { color: '#ff5555',  text: '● Error' },
  }
  const cfg = map[status] || map.idle
  return (
    <span style={{ ...mono, fontSize: '0.65rem', color: cfg.color, letterSpacing: '0.05em', animation: cfg.pulse ? 'blink 1.4s ease-in-out infinite' : 'none' }}>
      {cfg.text}
    </span>
  )
}

function EmptyState({ text, icon }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem', opacity: 0.5 }}>
      <span style={{ fontSize: '2rem' }}>{icon}</span>
      <p style={{ ...mono, fontSize: '0.75rem', color: '#607080', textAlign: 'center', lineHeight: 1.5 }}>{text}</p>
    </div>
  )
}

// ─── Main Dashboard Page ───────────────────────────────────────
export default function Dashboard() {
  const [runId,     setRunId]     = useState(null)
  const [running,   setRunning]   = useState(false)
  const [decision,  setDecision]  = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  function handleRunStart(id) {
    setRunId(null)
    setDecision(null)
    setRunning(true)
    // Small delay so SSE stream is ready on backend
    setTimeout(() => setRunId(id), 100)
  }

  function handleStreamEnd() {
    setRunning(false)
    setRefreshTick(t => t + 1)
  }

  return (
    <>
      {/* Scanline overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'var(--bg)', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,245,255,0.012) 2px, rgba(0,245,255,0.012) 4px)', pointerEvents: 'none' }} />
      </div>

      <main style={{ position: 'relative', zIndex: 1, paddingTop: '64px', minHeight: '100vh', padding: '80px 1.5rem 2rem' }}>
        {/* Page header */}
        <div style={{ maxWidth: '1400px', margin: '0 auto 2rem' }}>
          <span style={label}>Live Control Center</span>
          <h1 style={{ ...head, fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: '#f0f0f8', marginBottom: '0.4rem' }}>
            AuraTrade<span style={{ color: 'var(--cyan)' }}> Dashboard</span>
          </h1>
          <p style={{ ...mono, fontSize: '0.82rem', color: '#8ab0c0' }}>
            Real-time agent pipeline · ArmorClaw enforcement · Audit log · Portfolio positions
          </p>
        </div>

        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Row 1: Trade Trigger (full width) */}
          <TradeTrigger onRunStart={handleRunStart} running={running} />

          {/* Row 2: Agent Feed (60%) + Decision Card (40%) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}
               className="dashboard-middle">
            <div style={{ minHeight: '400px' }}>
              <AgentFeed runId={runId} onDecision={setDecision} onStreamEnd={handleStreamEnd} />
            </div>
            <div style={{ minHeight: '400px' }}>
              <DecisionCard decision={decision} />
            </div>
          </div>

          {/* Row 3: Audit Log (65%) + Positions (35%) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}
               className="dashboard-bottom">
            <AuditLogTable refreshTick={refreshTick} />
            <PositionsPanel refreshTick={refreshTick} />
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        @media (min-width: 900px) {
          .dashboard-middle { grid-template-columns: 3fr 2fr !important; }
          .dashboard-bottom { grid-template-columns: 2fr 1fr !important; }
        }
        @media (max-width: 600px) {
          main { padding: 74px 1rem 2rem !important; }
        }
        select option { background: #001420; color: #f0f0f8; }
        table tr:hover td { background: rgba(0,245,255,0.025); }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.3); border-radius: 2px; }
      `}</style>
    </>
  )
}
