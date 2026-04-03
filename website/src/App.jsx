import { Routes, Route } from 'react-router-dom'
import './index.css'
import Navbar              from './components/Navbar'
import HeroSection         from './components/HeroSection'
import StatsSection        from './components/StatsSection'
import ArchSection         from './components/ArchSection'
import LayersSection       from './components/LayersSection'
import PolicySection       from './components/PolicySection'
import StackSection        from './components/StackSection'
import TerminalSection     from './components/TerminalSection'
import ParticleCanvas      from './canvas/ParticleCanvas'
import Dashboard           from './pages/Dashboard'

function LandingPage() {
  return (
    <>
      <ParticleCanvas />
      <main style={{ position: 'relative', zIndex: 1 }}>
        <HeroSection />
        <StatsSection />
        <ArchSection />
        <LayersSection />
        <PolicySection />
        <StackSection />
        <TerminalSection />
      </main>
    </>
  )
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"          element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </>
  )
}
