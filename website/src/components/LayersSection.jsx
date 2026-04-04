import { useRef, useState } from 'react'
import useIntersection from '../hooks/useIntersection'

const LAYERS = [
  {
    num: '01', icon: '📄', accent: 'var(--cyan)',
    title: 'Intent Declaration',
    sub: 'Layer 1 — Immutable Policy Root',
    desc: 'intent.json declares the mission at boot. Authorized tickers [BTC/USD, AAPL, NVDA], $100K max order, $500K daily cap. Hashed and never mutated at runtime.',
    tags: ['intent.json', 'SHA-256 hash', 'Pydantic schema', 'Boot-time load'],
  },
  {
    num: '02', icon: '🦞', accent: 'var(--cyan)',
    title: 'OpenClaw v2026.3.2',
    sub: 'Layer 2 — Agent Orchestration (Live or Fallback)',
    desc: 'Live Path: Official OpenClaw gateway with real LLM agents. Fallback Path: Python demo orchestrator. Both execute three agents: Analyst proposes, Risk gates with delegation tokens, Trader submits. Tool calls are bound by role.',
    tags: ['OpenClaw', 'Live gateway', 'Demo fallback', 'HMAC tokens'],
  },
  {
    num: '03', icon: '⚙️', accent: '#b89cff',
    title: 'ArmorClaw Engine',
    sub: 'Layer 3 — Deterministic Enforcement',
    desc: '5 sequential checks. 14 named policy rules. Every order that passes all 5 checks reaches Alpaca. Every failure is logged to tamper-evident audit trail with block reason.',
    tags: ['5 checks', '14 rules', 'Audit log', 'Proof hash'],
  },
  {
    num: '04', icon: '📈', accent: 'var(--cyan)',
    title: 'Alpaca Paper Trading',
    sub: 'Layer 4 — Execution Boundary',
    desc: 'Only receives ArmorClaw-approved requests. Real market data, real execution, paper trading only (no real money). Provides account equity, positions, order confirmation back to audit trail.',
    tags: ['Paper trading', 'Real execution', 'No real money', 'Live market data'],
  },
]

export default function LayersSection() {
  const ref = useRef(null)
  const isVisible = useIntersection(ref)

  return (
    <section id="layers" ref={ref} style={{ padding: '7rem 2rem', background: 'linear-gradient(180deg, #00080f 0%, #001420 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <span className="section-label">Four-Layer Architecture</span>
        <h2 className="section-title">Built in Layers of Trust</h2>
        <p className="section-sub">Each layer trusts only the layer above it. ArmorClaw trusts no one.</p>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {LAYERS.map((layer, i) => (
          <LayerCard key={layer.num} {...layer} index={i} isVisible={isVisible} />
        ))}
      </div>
    </section>
  )
}

function LayerCard({ num, icon, accent, title, sub, desc, tags, index, isVisible }) {
  const [hovered, setHovered] = useState(false)
  const isPurple = accent === '#b89cff'
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: '2rem', alignItems: 'flex-start',
        padding: '1.8rem 2rem', borderRadius: '16px',
        background: hovered ? (isPurple ? 'rgba(124,58,237,0.07)' : 'rgba(0,245,255,0.05)') : 'var(--card-bg)',
        border: `1px solid ${hovered ? accent : (isPurple ? 'var(--border-purple)' : 'var(--border-cyan)')}`,
        boxShadow: hovered ? `0 0 35px ${isPurple ? 'rgba(124,58,237,0.35)' : 'rgba(0,245,255,0.35)'}` : 'none',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.6s ease ${index * 0.12}s, transform 0.6s ease ${index * 0.12}s, background 0.25s, box-shadow 0.3s, border-color 0.25s`,
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: accent, letterSpacing: '0.15em', opacity: 0.6 }}>{num}</div>
        <div style={{ fontSize: '2rem' }}>{icon}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{sub}</div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: accent, marginBottom: '0.6rem', letterSpacing: '0.04em' }}>{title}</h3>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1rem' }}>{desc}</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <span key={tag} style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              padding: '0.3rem 0.7rem', borderRadius: '99px',
              border: `1px solid ${isPurple ? 'rgba(124,58,237,0.4)' : 'rgba(0,245,255,0.3)'}`,
              color: isPurple ? '#b89cff' : 'var(--cyan)',
              background: isPurple ? 'rgba(124,58,237,0.06)' : 'rgba(0,245,255,0.05)',
            }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
