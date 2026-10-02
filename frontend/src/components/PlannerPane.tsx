import { GHOST_TRIP } from '../services/ghostTrip'
import type { PlanErrorKind } from '../services/api'
import { C } from '../utils/trip'
import { Icon } from './Icon'
import { LogSheet } from './LogSheet'

const HERO_RULES = ['11 h driving', '14 h window', '30 min break', '10 h rest', '70 h / 8 days']
const DEMO_LOG = { truck: 'TRUCK-001', trailer: 'TRL-001', carrier: 'Demo Carrier LLC', office: 'Demo City, ST', shipping: 'DEMO-0001' }

export function EmptyHero() {
  return (
    <div className="hero">
      <div className="hero-grid" />
      <div className="hero-glow" />
      <div className="hero-copy">
        <h2>Plan a compliant truck trip and get your daily logs drawn for you.</h2>
        <p>Enter a trip to see a compliant route and daily log sheets.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {HERO_RULES.map((r, i) => <span key={r} className="hero-rule" style={{ animationDelay: 200 + i * 50 + 'ms' }}>{r}</span>)}
        </div>
      </div>
      <div className="hero-sheet"><LogSheet trip={GHOST_TRIP} day={0} log={DEMO_LOG} dots /></div>
    </div>
  )
}

const STEPS = ['Finding truck route', 'Applying hours-of-service rules', 'Drawing daily logs']

export function LoadingState({ step, slow }: { step: number; slow: boolean }) {
  const six = [1, 2, 3, 4, 5, 6]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'hos-fade 200ms ease both' }}>
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {STEPS.map((l, i) => {
            const done = i < step, act = i === step
            return (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: done || act ? C.fg : '#71717a', fontWeight: act ? 600 : 500 }}>
                <span className="step-dot" style={{ borderColor: done ? C.d : act ? C.accent : '#d4d4d8', background: done ? C.d : 'transparent' }}>
                  {done && <Icon name="check" size={12} color="#fff" sw={3} />}
                </span>{l}
              </div>
            )
          })}
        </div>
        {slow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
            <div className="track"><div className="indet" /></div>
            <div style={{ fontSize: 13, color: '#52525b' }}>Waking up the server: the first request can take up to a minute.</div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
        {six.map(i => (
          <div key={i} className="panel" style={{ height: 96, padding: 14 }}>
            <div className="sk" style={{ width: '55%', height: 9 }} />
            <div className="sk" style={{ width: '75%', height: 18, marginTop: 14 }} />
            <div className="sk" style={{ width: '60%', height: 8, marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <div style={{ height: 380, background: '#ececef', borderRadius: 10 }} />
        <div className="panel" style={{ height: 380, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {six.map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="sk" style={{ width: 28, height: 28, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div className="sk" style={{ width: '50%', height: 9 }} />
                <div className="sk" style={{ width: '75%', height: 8, marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ height: 300 }} />
    </div>
  )
}

const SVC_TITLE: Record<Exclude<PlanErrorKind, 'noRoute'>, string> = {
  unavailable: 'Route planning is unavailable right now.',
  timeout: 'The server took too long to respond.',
  unexpected: 'Something went wrong while planning this trip.',
}

export function ServiceError({ kind, detail, onRetry, onNew }: { kind: Exclude<PlanErrorKind, 'noRoute'>; detail?: string; onRetry: () => void; onNew: () => void }) {
  return (
    <div className="panel" style={{ minHeight: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div className="err-icon"><Icon name="alertCircle" size={22} /></div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{SVC_TITLE[kind]}</div>
        {detail && <div className="error-text">{detail}</div>}
        <div style={{ fontSize: 14, color: '#71717a' }}>Your inputs are saved. Nothing was lost.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={onRetry}><Icon name="rotate" size={15} />Try again</button>
          {kind === 'unexpected' && <button className="btn" onClick={onNew}>New trip</button>}
        </div>
      </div>
    </div>
  )
}
