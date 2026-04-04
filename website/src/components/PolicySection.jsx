import { useRef, useState } from 'react'
import useIntersection from '../hooks/useIntersection'

const GROUPS = [
  {
    label: 'Trade & Exposure', color: 'var(--cyan)',
    rules: [
      { id: 'trade-size-limits',            desc: 'Blocks orders > $5,000 or daily spend > $20,000' },
      { id: 'portfolio-concentration-limit', desc: 'Single ticker must stay < 40% of portfolio' },
      { id: 'sector-exposure-limit',         desc: 'Any single GICS sector must stay < 60%' },
    ],
  },
  {
    label: 'Ticker & Asset', color: 'var(--cyan)',
    rules: [
      { id: 'ticker-universe-restriction', desc: 'Only NVDA · AAPL · GOOGL · MSFT · AMZN · META · TSLA · BTC/USD · ETH/USD allowed (from intent.json)' },
    ],
  },
  {
    label: 'Time & Regulatory', color: '#fbbf24',
    rules: [
      { id: 'market-hours-only',        desc: 'NYSE 09:30–16:00 ET, Mon–Fri. Crypto (BTC/USD, ETH/USD) exempt — trades 24/7' },
      { id: 'earnings-blackout-window', desc: 'No trades within ±2 days of earnings. (Demo stub — logs pass, production would load earnings calendar)' },
      { id: 'wash-sale-prevention',     desc: '30-day lock after a loss sale of same ticker. (Demo stub — production would check trade history)' },
    ],
  },
  {
    label: 'Data & File', color: '#22d3ee',
    rules: [
      { id: 'data-class-protection',  desc: 'RESTRICTED data cannot be accessed by unauthorized agents' },
      { id: 'directory-scoped-access', desc: 'File access locked to /data/agents/ only' },
    ],
  },
  {
    label: 'Tool Restrictions', color: '#a78bfa',
    rules: [
      { id: 'tool-restrictions', desc: 'Each agent may only call its declared tool list' },
    ],
  },
  {
    label: 'Delegation & Role', color: '#b89cff',
    rules: [
      { id: 'delegation-scope-enforcement', desc: 'Token fields must match order fields exactly' },
      { id: 'agent-role-binding',           desc: 'Orders must originate from registered Trader identity' },
      { id: 'intent-token-binding',         desc: 'intent_token_id must match loaded intent.json hash' },
      { id: 'risk-agent-read-only',         desc: 'Risk Agent may not call any write/execute tool' },
    ],
  },
]

export default function PolicySection() {
  const ref = useRef(null)
  const isVisible = useIntersection(ref)
  const [active, setActive] = useState(null)

  return (
    <section id="policy" ref={ref} style={{ padding: '7rem 2rem', background: 'linear-gradient(180deg, #001420 0%, #00080f 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <span className="section-label">Enforcement Engine</span>
        <h2 className="section-title">14 Policy Rules</h2>
        <p className="section-sub">Every rule is a named function in policy_rules.py. Hover to see what each one checks.</p>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {GROUPS.map((group, gi) => (
          <div key={group.label} style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transition: `opacity 0.6s ease ${gi * 0.1}s, transform 0.6s ease ${gi * 0.1}s` }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: group.color, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ display: 'inline-block', width: '20px', height: '1px', background: group.color, opacity: 0.6 }} />
              {group.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {group.rules.map(rule => (
                <button key={rule.id}
                  onMouseEnter={() => setActive(rule.id)}
                  onMouseLeave={() => setActive(null)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.73rem',
                    padding: '0.55rem 1rem', borderRadius: '8px',
                    border: `1px solid ${active === rule.id ? group.color : 'rgba(0,245,255,0.2)'}`,
                    background: active === rule.id ? `${group.color}18` : 'rgba(0,245,255,0.03)',
                    color: active === rule.id ? group.color : 'var(--text-muted)',
                    cursor: 'default', transition: 'all 0.2s', position: 'relative',
                    boxShadow: active === rule.id ? `0 0 20px ${group.color}44` : 'none',
                  }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'left' }}>
                    <span>{rule.id}</span>
                    {active === rule.id && <span style={{ fontSize: '0.65rem', opacity: 0.8, fontStyle: 'italic' }}>{rule.desc}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 5 Checks visual */}
      <div style={{ maxWidth: '700px', margin: '4rem auto 0', opacity: isVisible ? 1 : 0, transition: 'opacity 0.7s ease 0.5s' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--cyan)', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '1.5rem' }}>5 Sequential Enforcement Checks</div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Intent\nBinding', 'Token\nValidation', 'Exposure\nLimits', 'Regulatory\nRules', 'Tool\nAudit'].map((check, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                padding: '0.7rem 0.9rem', borderRadius: '8px', textAlign: 'center',
                background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.3)',
                color: 'var(--text-muted)', lineHeight: 1.4,
                whiteSpace: 'pre-line',
              }}>
                <span style={{ color: 'var(--cyan)', display: 'block', fontFamily: 'var(--font-heading)', fontSize: '0.75rem' }}>0{i+1}</span>
                {check}
              </div>
              {i < 4 && <span style={{ color: 'rgba(0,245,255,0.4)', fontSize: '1rem' }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
