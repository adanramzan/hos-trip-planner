import { useEffect, useRef, useState } from 'react'
import { Icon } from './components/Icon'
import { EmptyHero, LoadingState, ServiceError } from './components/PlannerPane'
import { PrintView } from './components/PrintView'
import { Results } from './components/Results'
import type { FormErrors } from './components/TripFormPanel'
import { PRESETS, TripFormPanel } from './components/TripFormPanel'
import { PlanError, ping, planTrip } from './services/api'
import type { LocKey, PlanErrorKind, Suggestion } from './services/api'
import type { LogDetails, Trip, TripForm } from './types/trip'

type Mode = 'planner' | 'loading' | 'results' | 'print'

const DEMO_LOG: LogDetails = { driver: 'Demo Driver', codriver: '', carrier: 'Demo Carrier LLC', office: 'Demo City, ST', truck: 'TRUCK-001', trailer: 'TRL-001', shipping: 'DEMO-0001' }
const pad = (n: number) => String(n).padStart(2, '0')
/** Tomorrow 08:00 as a datetime-local value; read as home-terminal time by the backend. */
function defaultDepart() {
  const d = new Date(Date.now() + 864e5)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`
}
const emptyF = (): TripForm => ({ current: '', pickup: '', dropoff: '', cycle: '', depart: defaultDepart(), ll: {} })

const ASSUMPTIONS = [
  'Property-carrying driver, 70 hours / 8 days', 'No adverse driving conditions', 'Fuel at least every 1,000 miles (30 minutes, on duty)',
  '1 hour each for pickup and dropoff', '15-minute pre- and post-trip inspections', '10-hour rest taken in the sleeper berth', 'No split sleeper berth',
]

export default function App() {
  const [mode, setMode] = useState<Mode>('planner')
  const [f, setFState] = useState<TripForm>(emptyF)
  const [log, setLogState] = useState<LogDetails>(DEMO_LOG)
  const [errors, setErrors] = useState<FormErrors>({})
  const [step, setStep] = useState(0)
  const [slow, setSlow] = useState(false)
  const [svcError, setSvcError] = useState<Exclude<PlanErrorKind, 'noRoute'> | null>(null)
  const [noRoute, setNoRoute] = useState(false)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripVersion, setTripVersion] = useState(0)
  const [activeSample, setActiveSample] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [assumOpen, setAssumOpen] = useState(false)
  const [replanning, setReplanning] = useState(false)
  const [printDays, setPrintDays] = useState<number[]>([])
  const timers = useRef<number[]>([])
  const run = useRef(0) // ignores responses from superseded requests

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  useEffect(ping, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setEditOpen(false); setAssumOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimers() }
  }, [])

  const setF = (k: keyof TripForm, v: string) => {
    // editing a location's text drops the coordinates of a previously picked suggestion
    setFState(s => ({ ...s, [k]: v, ll: k === 'current' || k === 'pickup' || k === 'dropoff' ? { ...s.ll, [k]: undefined } : s.ll }))
    setErrors(e => { const n = { ...e }; delete n[k]; return n })
    setActiveSample(null)
  }
  const onPick = (k: LocKey, g: Suggestion) => {
    setFState(s => ({ ...s, [k]: g.label, ll: { ...s.ll, [k]: [g.lat, g.lng] } }))
    setErrors(e => { const n = { ...e }; delete n[k]; return n })
    setActiveSample(null)
  }
  const setLog = (k: keyof LogDetails, v: string) => setLogState(s => ({ ...s, [k]: v }))
  const demo = (Object.keys(DEMO_LOG) as (keyof LogDetails)[]).every(k => log[k] === DEMO_LOG[k])

  const plan = async (form = f) => {
    const id = ++run.current
    clearTimers()
    setErrors({}); setNoRoute(false); setSvcError(null)
    const isReplan = mode === 'results'
    if (isReplan) { setEditOpen(false); setReplanning(true) }
    else {
      setMode('loading'); setStep(0); setSlow(false)
      later(() => setStep(1), 600); later(() => setStep(2), 1200); later(() => setSlow(true), 5000)
    }
    try {
      const t = await planTrip(form, log)
      if (id !== run.current) return
      clearTimers()
      const done = () => { setTrip(t); setTripVersion(v => v + 1); setMode('results'); setReplanning(false); window.scrollTo({ top: 0 }) }
      if (isReplan) done()
      else { setStep(3); later(done, 250) }
    } catch (err) {
      if (id !== run.current) return
      clearTimers()
      setReplanning(false)
      const kind: PlanErrorKind = err instanceof PlanError ? err.kind : 'unexpected'
      if (kind === 'noRoute') { if (err instanceof PlanError && err.field) setErrors({ [err.field]: err.message }); else setNoRoute(true); if (isReplan) setEditOpen(true); else setMode('planner') }
      else if (isReplan) { setNoRoute(false); setEditOpen(true); setSvcError(kind) }
      else { setSvcError(kind); setMode('planner') }
    }
  }

  const loadSample = (key: string) => {
    const { current, pickup, dropoff, cycle } = PRESETS.find(s => s.key === key)!
    const form: TripForm = { current, pickup, dropoff, cycle, depart: f.depart, ll: {} }
    setFState(form); setErrors({}); setActiveSample(key)
    plan(form)
  }

  const newTrip = () => {
    run.current++
    clearTimers()
    setMode('planner'); setFState(emptyF()); setTrip(null); setActiveSample(null); setErrors({})
    setSvcError(null); setNoRoute(false); setEditOpen(false); setReplanning(false)
    window.scrollTo({ top: 0 })
  }

  if (mode === 'print' && trip) {
    return <PrintView trip={trip} days={printDays} log={log} demo={demo} onExit={() => setMode('results')} />
  }

  const isResults = mode === 'results' && !!trip
  const isLoading = mode === 'loading'
  const form = (
    <TripFormPanel f={f} setF={setF} errors={errors} setErrors={setErrors} log={log} setLog={setLog}
      disabled={isLoading || replanning} busy={isLoading || replanning} isResults={isResults}
      onPick={onPick} noRoute={noRoute} clearNoRoute={() => setNoRoute(false)} activeSample={activeSample} onSample={loadSample}
      onPlan={() => plan()} onAssum={() => setAssumOpen(o => !o)} />
  )

  return (
    <div className="app">
      {isResults ? (
        <>
          <Results key={tripVersion} trip={trip} log={log} demo={demo} replanning={replanning}
            onEdit={() => { setEditOpen(true); setNoRoute(false) }} onNew={newTrip} onAssum={() => setAssumOpen(o => !o)}
            onPrint={days => { setPrintDays(days); setEditOpen(false); setMode('print'); window.scrollTo({ top: 0 }) }} />
          <aside className={'drawer' + (editOpen ? ' open' : '')} aria-hidden={!editOpen}>
            <div className="drawer-head">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Edit trip</div>
                <div style={{ fontSize: 13, color: '#71717a' }}>Changes re-plan the trip in place.</div>
              </div>
              <button className="icon-btn" onClick={() => setEditOpen(false)} aria-label="Close"><Icon name="x" size={18} /></button>
            </div>
            {svcError && <div className="error-text" style={{ padding: '0 4px 12px' }}>Couldn't update the plan. Try again.</div>}
            {form}
          </aside>
          {editOpen && <div className="scrim" onClick={() => setEditOpen(false)} />}
        </>
      ) : (
        <>
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="logo"><Icon name="truck" color="#fff" /></div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: '#fff' }}>HOS Trip Planner</div>
            </div>
            <button className="btn-dark-ghost" onClick={() => setAssumOpen(o => !o)}><Icon name="info" />Assumptions</button>
          </header>
          <main className="main" style={{ gridTemplateColumns: '440px minmax(0,1fr)' }}>
            <aside style={{ position: 'sticky', top: 24 }}>{form}</aside>
            <section style={{ minWidth: 0 }}>
              {isLoading ? <LoadingState step={step} slow={slow} />
                : svcError ? <ServiceError kind={svcError} onRetry={() => plan()} onNew={newTrip} />
                  : <EmptyHero />}
            </section>
          </main>
        </>
      )}

      {assumOpen && (
        <>
          <div className="scrim-clear" onClick={() => setAssumOpen(false)} />
          <div role="dialog" aria-label="Planning assumptions" className="popover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Planning assumptions</div>
              <button className="icon-btn sm" onClick={() => setAssumOpen(false)} aria-label="Close"><Icon name="x" size={14} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ASSUMPTIONS.map(a => (
                <div key={a} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.45, color: '#27272a' }}>
                  <span style={{ color: '#16204A', paddingTop: 2 }}><Icon name="check" size={14} sw={2.5} /></span>{a}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
