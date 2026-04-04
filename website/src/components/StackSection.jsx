import { useRef } from 'react'
import useIntersection from '../hooks/useIntersection'

const STACK = [
  { icon: '🐍', name: 'Python 3.11+',            role: 'Backend runtime',           color: 'var(--cyan)' },
  { icon: '🦞', name: 'OpenClaw v2026.3.2',      role: 'Agent orchestration',       color: 'var(--cyan)' },
  { icon: '⚡', name: 'FastAPI',                 role: 'REST + SSE API server',     color: 'var(--cyan)' },
  { icon: '⚛️', name: 'React + Vite',            role: 'Dashboard frontend',        color: 'var(--cyan)' },
  { icon: '⚙️', name: 'ArmorClaw Engine',        role: 'Policy enforcement',        color: '#b89cff' },
  { icon: '📈', name: 'Alpaca Paper API',        role: 'Paper trading execution',   color: 'var(--cyan)' },
  { icon: '🗄️', name: 'SQLite + SQLAlchemy',    role: 'Audit log persistence',     color: 'var(--cyan)' },
  { icon: '💎', name: 'OpenAI / Gemini / Claude', role: 'LLM reasoning (configurable)', color: '#4ade80' },
  { icon: '🔐', name: 'HMAC-SHA256',             role: 'Delegation token signing',  color: '#fbbf24' },
  { icon: '📋', name: 'Pydantic v2',             role: 'Schema validation',         color: 'var(--cyan)' },
]

export default function StackSection() {
  const ref = useRef(null)
  const isVisible = useIntersection(ref)

  return (
    <section id="stack" ref={ref} style={{ padding: '6rem 2rem', background: 'linear-gradient(180deg, #00080f 0%, #001420 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <span className="section-label">Technology Stack</span>
        <h2 className="section-title">Built with Production-Grade Tools</h2>
        <p className="section-sub">Every component chosen for auditability, correctness, and hackathon speed.</p>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '0.8rem', justifyContent: 'center' }}>
        {STACK.map((item, i) => (
          <div key={item.name} className="glass-card"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.8rem',
              padding: '1rem 1.4rem', minWidth: '200px', flex: '1 1 200px',
              opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: `opacity 0.5s ease ${i * 0.06}s, transform 0.5s ease ${i * 0.06}s`,
            }}>
            <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: item.color, letterSpacing: '0.04em' }}>{item.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{item.role}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
