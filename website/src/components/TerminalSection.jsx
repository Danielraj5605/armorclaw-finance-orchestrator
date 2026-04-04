import { useEffect, useRef, useState, useCallback } from 'react'

const TABS = [
  { id: 'allow', label: '✅  Allowed Trade',   icon: '✅' },
  { id: 'block', label: '🚫  Blocked Trade',   icon: '🚫' },
  { id: 'token', label: '🔐  Delegation Token', icon: '🔐' },
]

const ALLOW_LINES = [
  { text: '── AuraTrade v1.0 ──────────────────────────────────────', cls: 'divider', delay: 200 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '❯ POST /run-trade  { action: "BUY", ticker: "NVDA", amount_usd: 4000 }', cls: 'prompt', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Analyst]   Fetching NVDA market data...', cls: 'info',    delay: 500 },
  { text: '  [Analyst]   research tool: positive sentiment (+0.72)', cls: 'meta',    delay: 400 },
  { text: '  [Analyst]   → TradeProposal: BUY NVDA $4000 (conf: 0.82)', cls: 'cmd',  delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Risk]      get_positions → NVDA: 12% of portfolio',  cls: 'info',    delay: 500 },
  { text: '  [Risk]      get_account → equity: $48,000',           cls: 'meta',    delay: 300 },
  { text: '  [Risk]      calculate_exposure → post-trade: ~20%',   cls: 'meta',    delay: 300 },
  { text: '  [Risk]      → DelegationToken issued (60s TTL, HMAC-SHA256)', cls: 'secure', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Trader]    Submitting OrderRequest + Token to ArmorClaw...', cls: 'muted', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '╔═══ ArmorClaw Decision ═════════════════════════════════╗', cls: 'box',    delay: 300 },
  { text: '║  ✅ Check 1: PASS — NVDA ∈ authorized_tickers          ║', cls: 'secure', delay: 200 },
  { text: '║  ✅ Check 2: PASS — token signature valid (HMAC OK)     ║', cls: 'secure', delay: 200 },
  { text: '║  ✅ Check 3: PASS — concentration 20% < 40% limit       ║', cls: 'secure', delay: 200 },
  { text: '║  ✅ Check 4: PASS — 14:32 ET, within market hours       ║', cls: 'secure', delay: 200 },
  { text: '║  ✅ Check 5: PASS — tool access within scope            ║', cls: 'secure', delay: 200 },
  { text: '║                                                         ║', cls: 'box',    delay: 60  },
  { text: '║  ✅ DECISION: ALLOW                                     ║', cls: 'secure', delay: 300 },
  { text: '╚═══════════════════════════════════════════════════════╝', cls: 'box',    delay: 80  },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  Alpaca order accepted: order_id=alp-xxx-001', cls: 'cmd',  delay: 400 },
  { text: '  Audit log entry written: proof_hash=7c4d1e...', cls: 'muted', delay: 200 },
]

const BLOCK_LINES = [
  { text: '── AuraTrade v1.0 ──────────────────────────────────────', cls: 'divider', delay: 200 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '❯ POST /run-trade  { action: "BUY", ticker: "NVDA", amount_usd: 8000 }', cls: 'prompt', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Analyst]   Fetching NVDA market data...', cls: 'info',   delay: 500 },
  { text: '  [Analyst]   → TradeProposal: BUY NVDA $8000 (conf: 0.78)', cls: 'cmd',   delay: 500 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Risk]      calculate_exposure → post-trade NVDA: ~30%', cls: 'meta',   delay: 400 },
  { text: '  [Risk]      → DelegationToken issued (max_amount_usd: 8000)', cls: 'warn', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  [Trader]    Submitting $8000 OrderRequest to ArmorClaw...', cls: 'muted', delay: 400 },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '╔═══ ArmorClaw Decision ═════════════════════════════════╗', cls: 'alert',  delay: 300 },
  { text: '║  ❌ Check 1: FAIL — $8,000 exceeds max_order_usd $5,000   ║', cls: 'attack', delay: 300 },
  { text: '║     Rule fired: trade-size-limits                         ║', cls: 'attack', delay: 200 },
  { text: '║                                                           ║', cls: 'box',    delay: 60  },
  { text: '║  ⏭  Checks 2–5: SKIPPED (early-exit on Check 1 fail)    ║', cls: 'muted', delay: 200 },
  { text: '║                                                           ║', cls: 'box',    delay: 60  },
  { text: '║  🚫 DECISION: BLOCK                                       ║', cls: 'attack', delay: 300 },
  { text: '╚═══════════════════════════════════════════════════════╝', cls: 'alert',  delay: 80  },
  { text: '',                                                           cls: 'gap',     delay: 80  },
  { text: '  Order NOT forwarded to Alpaca. Portfolio unchanged.', cls: 'warn',   delay: 400 },
  { text: '  Audit log written: decision=BLOCK, rule=trade-size-limits, check=1', cls: 'muted', delay: 200 },
]

const TOKEN_LINES = [
  { text: '── DelegationToken Lifecycle ───────────────────────────', cls: 'divider', delay: 200 },
  { text: '',                                                          cls: 'gap',     delay: 80  },
  { text: '  [Risk Agent]  Issuing delegation token...', cls: 'info', delay: 400 },
  { text: '',                                                          cls: 'gap',     delay: 80  },
  { text: '  Token payload:', cls: 'label', delay: 300 },
  { text: '  {',             cls: 'box',    delay: 100 },
  { text: '    "token_id":              "tok-a1b2c3d4-...",', cls: 'meta',    delay: 150 },
  { text: '    "approved_by":           "RiskAgent",',         cls: 'meta',    delay: 100 },
  { text: '    "action":                "BUY",',               cls: 'meta',    delay: 100 },
  { text: '    "ticker":                "NVDA",',              cls: 'meta',    delay: 100 },
  { text: '    "max_amount_usd":        4000,',                cls: 'meta',    delay: 100 },
  { text: '    "issued_at":             "2024-01-15T14:30:00Z",', cls: 'meta', delay: 100 },
  { text: '    "expiry":                "2024-01-15T14:31:00Z",', cls: 'meta', delay: 100 },
  { text: '    "handoff_count":         1,',                   cls: 'meta',    delay: 100 },
  { text: '    "sub_delegation_allowed": false,',              cls: 'meta',    delay: 100 },
  { text: '    "signature":             "HMAC-SHA256:a8f9c2...", ', cls: 'secure', delay: 200 },
  { text: '  }',             cls: 'box',    delay: 100 },
  { text: '',                                                          cls: 'gap',     delay: 100 },
  { text: '  [ArmorClaw]  Validating token (Check 2):', cls: 'label', delay: 400 },
  { text: '  ✅ HMAC-SHA256 signature match',            cls: 'secure', delay: 300 },
  { text: '  ✅ expiry > now (57 seconds remaining)',    cls: 'secure', delay: 200 },
  { text: '  ✅ approved_by == "RiskAgent"',             cls: 'secure', delay: 200 },
  { text: '  ✅ handoff_count == 1 (no relay attacks)', cls: 'secure', delay: 200 },
  { text: '  ✅ sub_delegation_allowed == false',        cls: 'secure', delay: 200 },
  { text: '  ✅ token.ticker == order.ticker (NVDA)',    cls: 'secure', delay: 200 },
  { text: '  ✅ order.$4000 ≤ token.max_amount_usd $4000', cls: 'secure', delay: 200 },
  { text: '',                                                          cls: 'gap',     delay: 100 },
  { text: '  Token ID marked used (replay protection active).', cls: 'muted', delay: 300 },
]

const ALL_LINES = { allow: ALLOW_LINES, block: BLOCK_LINES, token: TOKEN_LINES }

const COLOR = {
  prompt: '#00f5ff', divider: 'rgba(0,245,255,0.3)', logo: '#00f5ff',
  header: '#00f5ff', meta: '#8ab0c0', muted: '#607080', status: '#607080',
  info: '#7c3aed', cmd: '#e0f0ff', box: 'rgba(0,245,255,0.25)',
  label: '#8ab0c0', result: '#f0f0f8', evidence: '#c0d8e8',
  secure: '#00ff88', fix: '#e0e0e0', match: '#ffd700',
  alert: 'rgba(255,80,80,0.4)', attack: '#ff6060', chain: '#ffaa60',
  warn: '#ffd700',
}

function TermLine({ line }) {
  if (line.cls === 'gap') return <div style={{ height: '0.45rem' }} />
  const color = COLOR[line.cls] || '#e0e0e0'
  return <div style={{ color, whiteSpace: 'pre', lineHeight: 1.65, fontSize: '0.78rem' }}>{line.text}</div>
}

export default function TerminalSection() {
  const [activeTab, setActiveTab] = useState('allow')
  const [displayed, setDisplayed] = useState([])
  const [showCursor, setShowCursor] = useState(false)
  const timeoutIds = useRef([])
  const bodyRef = useRef(null)

  const startTyping = useCallback((tab) => {
    setDisplayed([])
    setShowCursor(false)
    timeoutIds.current.forEach(id => clearTimeout(id))
    timeoutIds.current = []
    const lines = ALL_LINES[tab]
    let accumulated = 0
    lines.forEach((line) => {
      accumulated += line.delay
      const id = setTimeout(() => {
        setDisplayed(prev => [...prev, line])
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      }, accumulated)
      timeoutIds.current.push(id)
    })
    const cursorId = setTimeout(() => setShowCursor(true), accumulated + 200)
    timeoutIds.current.push(cursorId)
  }, [])

  useEffect(() => {
    startTyping(activeTab)
    return () => timeoutIds.current.forEach(id => clearTimeout(id))
  }, [activeTab, startTyping])

  return (
    <section id="demo" style={{ padding: '7rem 2rem', background: 'linear-gradient(180deg, #001020 0%, #00080f 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <span className="section-label">Live Demo</span>
        <h2 className="section-title">See AuraTrade in Action</h2>
        <p className="section-sub">Allowed trade · Blocked trade · Delegation token flow</p>
      </div>

      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0', flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: activeTab === tab.id ? 'rgba(0,245,255,0.12)' : 'rgba(0,245,255,0.03)',
              border: `1px solid ${activeTab === tab.id ? 'rgba(0,245,255,0.6)' : 'rgba(0,245,255,0.15)'}`,
              borderBottom: activeTab === tab.id ? '1px solid #040e16' : '1px solid rgba(0,245,255,0.15)',
              color: activeTab === tab.id ? '#00f5ff' : '#607080',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              padding: '0.6rem 1.2rem', borderRadius: '8px 8px 0 0',
              cursor: 'pointer', transition: 'all 0.2s ease', letterSpacing: '0.03em',
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={{ borderRadius: '0 8px 12px 12px', boxShadow: '0 0 60px rgba(0,245,255,0.12), 0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(0,245,255,0.2)', overflow: 'hidden' }}>
          <div style={{ background: '#040e16', padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(0,245,255,0.1)' }}>
            {[['#ff5f57','close'],['#ffbd2e','min'],['#28c840','max']].map(([bg, lbl]) => (
              <span key={lbl} style={{ width: '11px', height: '11px', borderRadius: '50%', background: bg, display: 'inline-block' }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#607080', marginLeft: '0.5rem' }}>auratrade-cli</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(0,245,255,0.4)' }}>
              {activeTab === 'allow' ? 'Happy Path — BUY NVDA $4000' : activeTab === 'block' ? 'Blocked Path — BUY NVDA $8000' : 'Token Lifecycle'}
            </span>
          </div>
          <div ref={bodyRef} style={{ background: '#040e16', padding: '1.2rem 1.4rem', minHeight: '460px', maxHeight: '520px', overflowY: 'auto', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
            {displayed.map((line, i) => <TermLine key={i} line={line} />)}
            {showCursor && <span style={{ color: '#00f5ff', textShadow: '0 0 10px #00f5ff', animation: 'blink 1s step-start infinite', fontSize: '0.85rem' }}>█</span>}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button onClick={() => startTyping(activeTab)} style={{
            background: 'transparent', border: '1px solid rgba(0,245,255,0.3)',
            color: 'var(--cyan)', fontFamily: 'var(--font-heading)', fontSize: '0.72rem',
            padding: '0.6rem 1.8rem', borderRadius: '8px', cursor: 'pointer',
            transition: 'background 0.2s, box-shadow 0.2s', letterSpacing: '0.06em',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,245,255,0.08)'; e.currentTarget.style.boxShadow = 'var(--glow-cyan)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none' }}>
            ↺  REPLAY
          </button>
        </div>
      </div>
      <style>{`@media (max-width: 600px) { #demo { padding: 4rem 1rem !important; } }`}</style>
    </section>
  )
}
