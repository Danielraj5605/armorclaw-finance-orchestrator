import { NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  function scrollTo(id) {
    if (!isHome) return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  const linkBase = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    padding: '0.5rem 0.8rem',
    borderRadius: '6px',
    transition: 'color 0.2s, background 0.2s',
    letterSpacing: '0.04em',
    textDecoration: 'none',
    display: 'inline-block',
  }

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: '64px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 2rem',
        background: 'rgba(0, 8, 15, 0.92)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(0, 245, 255, 0.18)',
      }}>

        {/* Logo */}
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '2px',
            background: 'var(--cyan)', boxShadow: '0 0 12px #00f5ff',
            animation: 'pulse-glow 2s ease-in-out infinite',
            transform: 'rotate(45deg)',
          }} />
          <span style={{
            fontFamily: 'var(--font-heading)', color: 'var(--cyan)',
            textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
            fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.06em', userSelect: 'none',
          }}>
            AuraTrade
          </span>
        </NavLink>

        {/* Desktop Nav */}
        <div className="nav-links" style={{ display: 'flex', gap: '0.15rem', alignItems: 'center' }}>
          {isHome && (
            <>
              {[
                { label: 'Overview',    id: 'architecture' },
                { label: 'Layers',      id: 'layers' },
                { label: 'Policy',      id: 'policy' },
                { label: 'Demo',        id: 'demo' },
              ].map(({ label, id }) => (
                <button key={id} onClick={() => scrollTo(id)} style={{ ...linkBase, color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--cyan)'; e.currentTarget.style.background = 'rgba(0,245,255,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}>
                  {label}
                </button>
              ))}
            </>
          )}

          <NavLink to="/" end style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
            background: isActive ? 'rgba(0,245,255,0.07)' : 'none',
            borderBottom: isActive ? '1px solid var(--cyan)' : 'none',
          })}>Home</NavLink>

          <NavLink to="/dashboard" style={({ isActive }) => ({
            ...linkBase, marginLeft: '0.25rem',
            padding: '0.5rem 1rem', borderRadius: '6px',
            color: isActive ? '#00080f' : 'var(--cyan)',
            background: isActive ? 'var(--cyan)' : 'rgba(0,245,255,0.06)',
            border: '1px solid rgba(0,245,255,0.4)',
            boxShadow: isActive ? '0 0 20px rgba(0,245,255,0.5)' : 'none',
            fontFamily: 'var(--font-heading)', letterSpacing: '0.05em',
            transition: 'all 0.2s',
          })}>Dashboard</NavLink>
        </div>

        {/* Hamburger */}
        <button
          className="hamburger"
          onClick={() => setMenuOpen(o => !o)}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', flexDirection: 'column', gap: '5px', padding: '0.4rem' }}>
          {[0,1,2].map(i => (
            <span key={i} style={{ display: 'block', width: '22px', height: '2px', background: 'var(--cyan)', borderRadius: '2px' }} />
          ))}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: '64px', left: 0, right: 0, zIndex: 49,
          background: 'rgba(0, 8, 15, 0.97)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,245,255,0.15)',
          padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          {isHome && [
            { label: 'Overview', id: 'architecture' },
            { label: 'Layers',   id: 'layers' },
            { label: 'Policy',   id: 'policy' },
            { label: 'Demo',     id: 'demo' },
          ].map(({ label, id }) => (
            <button key={id} onClick={() => scrollTo(id)}
              style={{ ...linkBase, color: 'var(--text-muted)', textAlign: 'left', width: '100%' }}>
              {label}
            </button>
          ))}
          <NavLink to="/"          onClick={() => setMenuOpen(false)} style={{ ...linkBase, color: 'var(--cyan)' }}>Home</NavLink>
          <NavLink to="/dashboard" onClick={() => setMenuOpen(false)} style={{ ...linkBase, color: 'var(--cyan)', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)' }}>Dashboard</NavLink>
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          .nav-links { display: none !important; }
          .hamburger { display: flex !important; }
        }
      `}</style>
    </>
  )
}
