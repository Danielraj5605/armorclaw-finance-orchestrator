import { useEffect, useRef, useState } from 'react'
import useIntersection from '../hooks/useIntersection'

const CARDS = [
  { value: 14,     label: 'policy rules enforced',  type: 'count', suffix: '' },
  { value: 5,      label: 'enforcement checks',      type: 'count', suffix: '' },
  { value: 5000,   label: 'max order cap (USD)',     type: 'count', suffix: '' },
  { value: 20000,  label: 'max daily spend (USD)',   type: 'count', suffix: '' },
]

function NumberCounter({ value, suffix, isVisible }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!isVisible) return
    const duration = 1400
    const start = performance.now()
    let rafId
    const step = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * value))
      if (progress < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [isVisible, value])
  return <>{count.toLocaleString()}{suffix}</>
}

function StatCard({ value, label, type, suffix, index }) {
  const ref = useRef(null)
  const isVisible = useIntersection(ref)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref} className="glass-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: '200px', maxWidth: '260px',
        padding: '2.5rem 2rem', textAlign: 'center',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? (hovered ? 'translateY(-6px) scale(1.03)' : 'translateY(0)') : 'translateY(40px)',
        transition: `opacity 0.6s ease ${index * 0.12}s, transform 0.4s ease, box-shadow 0.3s ease`,
        boxShadow: hovered ? '0 0 50px rgba(0,245,255,0.6)' : 'var(--glow-cyan)',
      }}>
      <span style={{
        fontFamily: 'var(--font-heading)', fontSize: '3rem',
        color: 'var(--cyan)', display: 'block', marginBottom: '0.75rem',
        letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(0,245,255,0.4)',
        animation: isVisible ? `counter-ping 0.4s ease ${index * 0.12 + 1.1}s` : 'none',
      }}>
        <NumberCounter value={value} suffix={suffix} isVisible={isVisible} />
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </span>
    </div>
  )
}

export default function StatsSection() {
  const titleRef = useRef(null)
  const titleVis = useIntersection(titleRef)
  return (
    <section style={{
      padding: '6rem 2rem', textAlign: 'center',
      background: 'linear-gradient(180deg, #00080f 0%, #001420 100%)',
      position: 'relative', zIndex: 1,
    }}>
      <div style={{ width: '1px', height: '60px', background: 'linear-gradient(var(--cyan), transparent)', margin: '0 auto 3rem', boxShadow: '0 0 10px var(--cyan)' }} />
      <div ref={titleRef}>
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)',
          marginBottom: '0.75rem', color: 'var(--text)',
          opacity: titleVis ? 1 : 0, transform: titleVis ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}>
          Safety by the Numbers
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '3rem', opacity: titleVis ? 1 : 0, transition: 'opacity 0.6s ease 0.2s' }}>
          Hard limits that no AI agent can override
        </p>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {CARDS.map((card, i) => <StatCard key={card.label} {...card} index={i} />)}
      </div>
      <div style={{ marginTop: '4rem', padding: '1.5rem', background: 'rgba(0, 245, 255, 0.03)', borderTop: '1px solid rgba(0, 245, 255, 0.1)', borderBottom: '1px solid rgba(0, 245, 255, 0.1)', maxWidth: '860px', margin: '4rem auto 0' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--cyan)', letterSpacing: '0.02em', lineHeight: 1.6 }}>
          "ArmorClaw sits between every agent and Alpaca.
          <br /><span style={{ color: 'var(--text-muted)' }}>Even a hallucinating LLM cannot place an oversized, unauthorized, or off-hours order."</span>
        </p>
      </div>
    </section>
  )
}
