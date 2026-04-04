import { useRef, useState } from 'react'
import useIntersection from '../hooks/useIntersection'

const AGENTS = [
  {
    icon: '🔍', name: 'Analyst Agent', cyan: false,
    desc: 'tools: market-data, research',
    detail: 'Fetches OHLC price data, news sentiment, and analyst ratings. Produces a TradeProposal with confidence score. Cannot touch account or place orders.',
  },
  {
    icon: '🛡️', name: 'Risk Agent', cyan: true,
    desc: 'tools: get_positions, get_account, calculate_exposure',
    detail: 'Read-only exposure gatekeeper. Validates single-ticker (<40%) and sector (<60%) concentration. Computes post-trade exposure via calculate_exposure. Issues HMAC-SHA256 DelegationTokens with 60s TTL — the Trader must present a valid token or ArmorClaw blocks.',
  },
  {
    icon: '⚡', name: 'Trader Agent', cyan: false,
    desc: 'tools: alpaca-trading:execute only',
    detail: 'Constructs the final OrderRequest, attaches the DelegationToken, and submits to ArmorClaw. If ArmorClaw blocks, order never reaches Alpaca.',
  },
]

const BOX_BASE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border-cyan)', background: 'rgba(0, 245, 255, 0.06)',
  borderRadius: '8px', fontFamily: 'var(--font-heading)', fontSize: '0.72rem',
  color: 'var(--text)', padding: '0.65rem 1.6rem', textAlign: 'center', letterSpacing: '0.04em',
}
const CONNECTOR_V = { width: '2px', height: '40px', background: 'linear-gradient(#00f5ff, rgba(0,245,255,0.1))', margin: '0 auto', boxShadow: '0 0 6px rgba(0,245,255,0.4)' }

function BranchConnector({ count }) {
  return (
    <div style={{ position: 'relative', height: '56px' }}>
      <div style={{ position: 'absolute', top: 0, left: `${100 / (count + 1)}%`, right: `${100 / (count + 1)}%`, height: '2px', background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)', boxShadow: '0 0 8px rgba(0,245,255,0.5)' }} />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', top: 0, left: `${((i + 1) / (count + 1)) * 100}%`, width: '2px', height: '100%', background: 'linear-gradient(var(--cyan), rgba(0,245,255,0.1))', transform: 'translateX(-50%)', boxShadow: '0 0 5px rgba(0,245,255,0.3)' }} />
      ))}
    </div>
  )
}

function MergeConnector({ count }) {
  return (
    <div style={{ position: 'relative', height: '56px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', bottom: 0, left: `${((i + 1) / (count + 1)) * 100}%`, width: '2px', height: '100%', background: 'linear-gradient(rgba(0,245,255,0.1), var(--cyan))', transform: 'translateX(-50%)', boxShadow: '0 0 5px rgba(0,245,255,0.3)' }} />
      ))}
      <div style={{ position: 'absolute', bottom: 0, left: `${100 / (count + 1)}%`, right: `${100 / (count + 1)}%`, height: '2px', background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)', boxShadow: '0 0 8px rgba(0,245,255,0.5)' }} />
    </div>
  )
}

function AgentBox({ icon, name, desc, detail, cyan, visible, delay }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flex: 1, minWidth: '160px', maxWidth: '200px',
        padding: hovered ? '1rem 0.8rem' : '1.2rem 1rem', borderRadius: '12px',
        background: hovered ? (cyan ? 'rgba(0,245,255,0.1)' : 'rgba(0,245,255,0.06)') : 'var(--card-bg)',
        border: `1px solid ${cyan ? 'rgba(0,245,255,0.5)' : 'var(--border-cyan)'}`,
        transition: `transform 0.35s ease, box-shadow 0.35s ease, opacity 0.5s ease ${delay}ms, background 0.25s ease, padding 0.25s ease`,
        cursor: 'default',
        transform: !visible ? 'translateY(35px)' : hovered ? 'translateY(-10px)' : 'translateY(0)',
        boxShadow: hovered ? (cyan ? '0 0 40px rgba(0,245,255,0.5)' : '0 0 30px rgba(0,245,255,0.3)') : 'none',
        opacity: visible ? 1 : 0, position: 'relative', overflow: 'hidden',
      }}>
      {hovered && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(0,245,255,0.08) 50%, transparent 60%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s linear infinite', pointerEvents: 'none' }} />}
      <span style={{ fontSize: '1.7rem', marginBottom: '0.5rem' }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.68rem', color: cyan ? 'var(--cyan)' : 'var(--text)', textAlign: 'center', letterSpacing: '0.04em' }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', textAlign: 'center', lineHeight: 1.4 }}>{hovered ? detail : desc}</span>
    </div>
  )
}

export default function ArchSection() {
  const sectionRef  = useRef(null)
  const agentRowRef = useRef(null)
  const isVisible   = useIntersection(sectionRef)
  const agentRowVis = useIntersection(agentRowRef)

  return (
    <section id="architecture" ref={sectionRef} style={{ padding: '7rem 2rem', background: 'linear-gradient(180deg, #001420 0%, #00080f 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '3.5rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <span className="section-label">System Architecture</span>
        <h2 className="section-title">How AuraTrade Enforces Safety</h2>
        <p className="section-sub">Three role-bound agents. One deterministic enforcement engine. Zero trust between layers.</p>
      </div>

      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2rem' }}>User Request — POST /run-trade</span>
        </div>
        <div style={CONNECTOR_V} />
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2.8rem', border: '1px solid rgba(0,245,255,0.5)' }}>LangGraph Orchestrator (OpenClaw)</span>
        </div>
        <BranchConnector count={3} />

        <div ref={agentRowRef} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {AGENTS.map((agent, i) => <AgentBox key={agent.name} {...agent} visible={agentRowVis} delay={i * 120} />)}
        </div>

        <MergeConnector count={3} />

        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2.2rem' }}>OrderRequest + DelegationToken</span>
        </div>
        <div style={CONNECTOR_V} />
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, border: '1px solid rgba(124,58,237,0.6)', background: 'rgba(124,58,237,0.08)', color: '#b89cff', padding: '0.65rem 2.4rem', boxShadow: 'var(--glow-purple)' }}>⚙️ ArmorClaw — 5 Checks · 14 Rules</span>
        </div>
        <div style={CONNECTOR_V} />
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, border: '1px solid rgba(0,245,255,0.7)', background: 'rgba(0,245,255,0.1)', color: 'var(--cyan)', padding: '0.65rem 2.2rem', boxShadow: 'var(--glow-cyan)', animation: isVisible ? 'pulse-glow 2.5s ease-in-out infinite' : 'none' }}>
            ALLOW → Alpaca Paper Trading API ✓
          </span>
        </div>

        <div style={{ marginTop: '2.5rem', padding: '1.2rem 1.8rem', background: 'rgba(124, 58, 237, 0.08)', border: '1px solid var(--border-purple)', borderRadius: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#b89cff', lineHeight: 1.6, opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease 0.5s, transform 0.6s ease 0.5s' }}>
          🔒 <strong>ArmorClaw is unique</strong> — it enforces a cryptographic delegation token chain between agents.
          Risk Agent issues an HMAC-SHA256 signed token binding: action, ticker, max_amount_usd, expiry (60s TTL), handoff_count, and sub_delegation_allowed. ArmorClaw verifies all six fields plus signature before any order reaches Alpaca.
        </div>

        <div style={{ marginTop: '2.5rem', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(0, 245, 255, 0.15)', background: 'rgba(0, 245, 255, 0.04)', textAlign: 'center', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease 0.6s, transform 0.6s ease 0.6s' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, fontStyle: 'italic' }}>
            "We don't let AI decide what it can calculate. Exposure limits are hard math. Policy rules are deterministic code.
            <span style={{ color: 'var(--cyan)' }}> The LLM only does what it's actually good at: market reasoning.</span>"
          </p>
        </div>
      </div>
      <style>{`@media (max-width:600px){#architecture{padding:4rem 1rem !important;}}`}</style>
    </section>
  )
}
