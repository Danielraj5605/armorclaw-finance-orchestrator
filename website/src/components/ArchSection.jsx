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
    desc: 'tools: get_positions, get_account',
    detail: 'Read-only exposure gatekeeper. Validates concentration limits and daily spend. Issues HMAC-signed DelegationTokens with 60s TTL. Cannot execute anything.',
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
  const sectionRef = useRef(null)
  const agentRowRef = useRef(null)
  const isVisible = useIntersection(sectionRef)
  const agentRowVis = useIntersection(agentRowRef)

  return (
    <section id="architecture" ref={sectionRef} style={{ padding: '7rem 2rem', background: 'linear-gradient(180deg, #001420 0%, #00080f 100%)', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '3.5rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <span className="section-label">System Architecture</span>
        <h2 className="section-title">How ArmorClaw Enforces Safety</h2>
        <p className="section-sub">Three role-bound agents. One deterministic enforcement engine. Zero trust between layers.</p>
      </div>

      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2rem' }}>User Request — POST /run-trade</span>
        </div>
        <div style={CONNECTOR_V} />
        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2.8rem', border: '1px solid rgba(0,245,255,0.5)' }}>OpenClaw v2026.3.2</span>
        </div>
        <BranchConnector count={3} />

        <div ref={agentRowRef} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {AGENTS.map((agent, i) => <AgentBox key={agent.name} {...agent} visible={agentRowVis} delay={i * 120} />)}
        </div>

        <MergeConnector count={3} />

        <div style={{ textAlign: 'center' }}>
          <span style={{ ...BOX_BASE, padding: '0.65rem 2.2rem' }}>Cryptographically signed DelegationToken</span>
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
          🔒 <strong>ArmorClaw is unique</strong> — it is the only team that enforces a cryptographic delegation token chain between agents.
          Risk Agent issues a HMAC-signed token. Trader must present it. ArmorClaw verifies signature, expiry, and field match before any order reaches Alpaca.
        </div>

        <div style={{ marginTop: '2.5rem', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(0, 245, 255, 0.15)', background: 'rgba(0, 245, 255, 0.04)', textAlign: 'center', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease 0.6s, transform 0.6s ease 0.6s' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, fontStyle: 'italic' }}>
            "We don't let AI decide what it can calculate. Exposure limits are hard math. Policy rules are deterministic code.
            <span style={{ color: 'var(--cyan)' }}> The LLM only does what it's actually good at: market reasoning.</span>"
          </p>
        </div>
      </div>

      {/* DelegationToken Cryptographic Flow */}
      <div style={{ marginTop: '5rem', maxWidth: '1100px', margin: '5rem auto 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(24px)', transition: 'opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s' }}>
          <span className="section-label">Deep Dive: Token Security</span>
          <h3 style={{ fontSize: '1.4rem', color: 'var(--text)', marginTop: '0.8rem', fontFamily: 'var(--font-heading)' }}>DelegationToken + HMAC-SHA256 Cryptography</h3>
        </div>

        {/* Token Flow Diagram */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
          {/* Step 1: Risk Agent Creates Token */}
          <div style={{ padding: '1.5rem', border: '1px solid rgba(0,245,255,0.4)', borderRadius: '12px', background: 'rgba(0,245,255,0.06)', transition: 'all 0.4s ease', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>🛡️</div>
            <h4 style={{ color: 'var(--cyan)', fontSize: '0.9rem', fontFamily: 'var(--font-heading)', marginBottom: '1rem', letterSpacing: '0.03em' }}>STEP 1: Risk Agent Creates Payload</h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.8, background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', textAlign: 'left' }}>
              <div style={{ color: '#80d4ff' }}>let payload = {'{'}  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>ticker: "AAPL",  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>amount: 100,  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>action: "BUY",  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>exposure: 0.15,  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>timestamp: 1712275200,  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>expiry: 60  </div>
              <div style={{ color: '#80d4ff' }}>{'}'}</div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.8rem', lineHeight: 1.5 }}>Read-only analysis. No private keys. No direct execution capability.</p>
          </div>

          {/* Step 2: HMAC-SHA256 Signing */}
          <div style={{ padding: '1.5rem', border: '1px solid rgba(124,58,237,0.4)', borderRadius: '12px', background: 'rgba(124,58,237,0.06)', transition: 'all 0.4s ease', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transitionDelay: '0.1s' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>🔐</div>
            <h4 style={{ color: '#b89cff', fontSize: '0.9rem', fontFamily: 'var(--font-heading)', marginBottom: '1rem', letterSpacing: '0.03em' }}>STEP 2: HMAC-SHA256 Signing</h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.8, background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', textAlign: 'left' }}>
              <div style={{ color: '#d4b5ff' }}>signature = HMAC-SHA256(</div>
              <div style={{ marginLeft: '1rem', color: '#e8d4ff' }}>payload,  </div>
              <div style={{ marginLeft: '1rem', color: '#e8d4ff' }}>shared_secret  </div>
              <div style={{ color: '#d4b5ff' }}>)  </div>
              <div style={{ marginTop: '0.8rem', color: '#ffd700', background: 'rgba(255,215,0,0.1)', padding: '0.6rem', borderRadius: '4px' }}>→ 256-bit hash</div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.8rem', lineHeight: 1.5 }}>Secret stored securely. Signature proves authorization intent.</p>
          </div>

          {/* Step 3: Token Transmission */}
          <div style={{ padding: '1.5rem', border: '1px solid rgba(0,245,255,0.4)', borderRadius: '12px', background: 'rgba(0,245,255,0.06)', transition: 'all 0.4s ease', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transitionDelay: '0.2s' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>⚡</div>
            <h4 style={{ color: 'var(--cyan)', fontSize: '0.9rem', fontFamily: 'var(--font-heading)', marginBottom: '1rem', letterSpacing: '0.03em' }}>STEP 3: Token Transmitted to Trader</h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.8, background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', textAlign: 'left' }}>
              <div style={{ color: '#80d4ff' }}>delegationToken = {'{'}  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>payload: {'{'}...{'}'},{'\u00A0'} </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>signature: "a7f3...",...  </div>
              <div style={{ marginLeft: '1rem', color: '#b3e5fc' }}>issuedAt: 1712275200  </div>
              <div style={{ color: '#80d4ff' }}>{'}'}</div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.8rem', lineHeight: 1.5 }}>Trader cannot forge. Cannot modify. Only passes through.</p>
          </div>
        </div>

        {/* Verification Flow */}
        <div style={{ marginTop: '2.5rem', padding: '1.8rem', border: '2px solid rgba(0,245,255,0.3)', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(0,245,255,0.04) 0%, rgba(124,58,237,0.04) 100%)', opacity: isVisible ? 1 : 0, transform: isVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s' }}>
          <h4 style={{ color: 'var(--cyan)', fontSize: '0.95rem', fontFamily: 'var(--font-heading)', marginBottom: '1.5rem', letterSpacing: '0.03em' }}>ArmorClaw Verification Pipeline</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Check 1 */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', minWidth: '32px', borderRadius: '6px', background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.5)', color: 'var(--cyan)', fontSize: '0.9rem', fontWeight: 'bold' }}>1</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>Signature Verification</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#80d4ff' }}>HMAC-SHA256(payload, secret)</code> must match received signature
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold', background: 'rgba(74,222,128,0.1)', padding: '0.3rem 0.8rem', borderRadius: '4px' }}>✓ PASS</div>
            </div>

            {/* Check 2 */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', minWidth: '32px', borderRadius: '6px', background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.5)', color: 'var(--cyan)', fontSize: '0.9rem', fontWeight: 'bold' }}>2</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>Expiry Validation</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#80d4ff' }}>now - issuedAt &lt; 60 seconds</code> — Token must be fresh
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold', background: 'rgba(74,222,128,0.1)', padding: '0.3rem 0.8rem', borderRadius: '4px' }}>✓ PASS</div>
            </div>

            {/* Check 3 */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', minWidth: '32px', borderRadius: '6px', background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.5)', color: 'var(--cyan)', fontSize: '0.9rem', fontWeight: 'bold' }}>3</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>Scope Binding</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#80d4ff' }}>token.payload.ticker == OrderRequest.ticker</code> — Ticker unchanged
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold', background: 'rgba(74,222,128,0.1)', padding: '0.3rem 0.8rem', borderRadius: '4px' }}>✓ PASS</div>
            </div>

            {/* Check 4 */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', minWidth: '32px', borderRadius: '6px', background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.5)', color: 'var(--cyan)', fontSize: '0.9rem', fontWeight: 'bold' }}>4</div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)', fontFamily: 'var(--font-heading)' }}>Exposure Ceiling</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#80d4ff' }}>token.payload.exposure &lt;= max_allowed</code> — Limits enforced
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold', background: 'rgba(74,222,128,0.1)', padding: '0.3rem 0.8rem', borderRadius: '4px' }}>✓ PASS</div>
            </div>

            {/* Result */}
            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.4)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', color: '#4ade80', fontWeight: 'bold', marginBottom: '0.4rem' }}>✓ ALL CHECKS PASSED</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Order forwarded to Alpaca with encrypted confirmation</div>
            </div>
          </div>
        </div>

        {/* Key Security Points */}
        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--cyan)', marginBottom: '0.5rem' }}>🔒 Non-Forgeable</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>256-bit HMAC signature prevents modification. Trader cannot change ticker or amount.</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--cyan)', marginBottom: '0.5rem' }}>⏱️ Time-Bound</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>60-second TTL prevents replay attacks. Expired tokens rejected automatically.</div>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--cyan)', marginBottom: '0.5rem' }}>🎯 Scope-Bound</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>Token locked to specific ticker/amount. Prevents scope expansion or switching.</div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width:600px){
          #architecture{padding:4rem 1rem !important;}
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </section>
  )
}
