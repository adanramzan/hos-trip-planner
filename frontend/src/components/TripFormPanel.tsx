import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { suggest } from '../services/api'
import type { LocKey, Suggestion } from '../services/api'
import type { IconName, LogDetails, TripForm } from '../types/trip'
import { qh } from '../utils/format'
import { C } from '../utils/trip'
import { Icon } from './Icon'

export type FormErrors = Partial<Record<keyof TripForm, string>>

const LOC: { k: LocKey; label: string; ph: string; noun: string; icon: IconName }[] = [
  { k: 'current', label: 'Current location', ph: 'e.g. Newark, NJ', noun: 'current location', icon: 'circle' },
  { k: 'pickup', label: 'Pickup location', ph: 'e.g. Philadelphia, PA', noun: 'pickup location', icon: 'package' },
  { k: 'dropoff', label: 'Dropoff location', ph: 'e.g. Denver, CO', noun: 'dropoff location', icon: 'flag' },
]

export const PRESETS: { key: string; chip: string; icon: IconName; current: string; pickup: string; dropoff: string; cycle: string }[] = [
  { key: 'short', chip: 'Short trip', icon: 'route', current: 'Dallas, TX', pickup: 'Fort Worth, TX', dropoff: 'Austin, TX', cycle: '10' },
  { key: 'long', chip: 'Long haul', icon: 'truck', current: 'Boston, MA', pickup: 'Chicago, IL', dropoff: 'Los Angeles, CA', cycle: '15' },
  { key: 'restart', chip: 'Near cycle limit', icon: 'history', current: 'Chicago, IL', pickup: 'Indianapolis, IN', dropoff: 'Nashville, TN', cycle: '65' },
]

const LOG_FIELDS: [keyof LogDetails, string, boolean][] = [
  ['driver', 'Driver', false], ['codriver', 'Co-driver', false], ['carrier', 'Carrier', true], ['office', 'Main office', true],
  ['truck', 'Truck number', false], ['trailer', 'Trailer number', false], ['shipping', 'Shipping document', true],
]

export function validate(f: TripForm): FormErrors {
  const e: FormErrors = {}
  LOC.forEach(({ k, noun }) => {
    const v = f[k].trim()
    if (!v) e[k] = `Enter a ${noun}.`
  })
  const c = parseFloat(f.cycle)
  if (f.cycle === '' || isNaN(c) || c < 0 || c > 70) e.cycle = 'Enter hours between 0 and 70.'
  return e
}

interface Props {
  f: TripForm
  setF: (k: keyof TripForm, v: string) => void
  errors: FormErrors
  setErrors: (e: FormErrors) => void
  log: LogDetails
  setLog: (k: keyof LogDetails, v: string) => void
  disabled: boolean
  busy: boolean
  isResults: boolean
  noRoute: boolean
  clearNoRoute: () => void
  onPick: (k: LocKey, s: Suggestion) => void
  activeSample: string | null
  onSample: (key: string) => void
  onPlan: () => void
  onAssum: () => void
}

export function TripFormPanel(p: Props) {
  const { f, errors, disabled } = p
  const [focus, setFocus] = useState<LocKey | null>(null)
  const [ai, setAi] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const [sug, setSug] = useState<{ q: string; list: Suggestion[] } | null>(null)
  const refs = useRef<Partial<Record<keyof TripForm, HTMLInputElement | null>>>({})

  const submit = () => {
    const e = validate(f)
    if (Object.keys(e).length) {
      p.setErrors(e)
      const first = (['current', 'pickup', 'dropoff', 'cycle'] as const).find(k => e[k])
      setTimeout(() => first && refs.current[first]?.focus(), 30)
      return
    }
    p.onPlan()
  }

  const pick = (k: LocKey, s: Suggestion) => { p.onPick(k, s); setAi(0) }

  // Debounced autocomplete for the focused field; a result only shows while its query still matches the input.
  const fq = focus && !f.ll[focus] ? f[focus].trim() : ''
  useEffect(() => {
    if (fq.length < 3) return
    let stale = false
    const t = setTimeout(() => { suggest(fq).then(list => { if (!stale) setSug({ q: fq, list }) }).catch(() => {}) }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [fq])

  const cn = parseFloat(f.cycle), cOk = f.cycle !== '' && !isNaN(cn) && cn >= 0 && cn <= 70

  return (
    <div className="form-card">
      {p.noRoute && (
        <div className="notice">
          <div style={{ color: '#3f3f46', paddingTop: 1 }}><Icon name="alert" size={18} /></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>There's no drivable truck route between these locations.</div>
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => { p.clearNoRoute(); setTimeout(() => refs.current.current?.focus(), 20) }}>Edit locations</button>
          </div>
        </div>
      )}

      {!p.isResults && <h1 className="form-title">Plan a trip</h1>}

      <div className="stack-8">
        <div className="caption">Try a sample trip</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map(s => (
            <button key={s.key} className={'pill' + (p.activeSample === s.key ? ' active' : '')} disabled={disabled}
              onClick={() => p.onSample(s.key)}>
              <Icon name={s.icon} size={14} />{s.chip}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {LOC.map(({ k, label, ph, icon }, idx) => {
          const v = f[k], exact = !!f.ll[k]
          const open = focus === k && !exact && sug?.q === v.trim()
          const list = open ? sug!.list : []
          const err = errors[k]
          const onKeyDown = (e: KeyboardEvent) => {
            if (!open) return
            const n = Math.max(list.length, 1)
            if (e.key === 'ArrowDown') { e.preventDefault(); setAi((ai + 1) % n) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAi((ai - 1 + n) % n) }
            else if (e.key === 'Enter' && list.length) { e.preventDefault(); pick(k, list[ai]) }
            else if (e.key === 'Escape') setFocus(null)
          }
          return (
            <div key={k} className="loc-row">
              <div className="loc-rail">
                <div style={{ height: 26 }} />
                <div className="loc-node">
                  <Icon name={icon} size={icon === 'circle' ? 16 : 17} color={C.navy} sw={icon === 'circle' ? 2.5 : 2} />
                </div>
                <div className="loc-line" style={{ borderLeftColor: idx < 2 ? '#d4d4d8' : 'transparent' }} />
              </div>
              <div style={{ position: 'relative', paddingBottom: 16 }}>
                <label className="label" htmlFor={'loc-' + k}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <input id={'loc-' + k} ref={el => { refs.current[k] = el }} className={'input' + (err ? ' invalid' : '')}
                    style={{ width: '100%', paddingRight: 64 }} value={v} disabled={disabled} placeholder={ph}
                    autoComplete="off" aria-invalid={!!err} role="combobox" aria-expanded={open}
                    onChange={e => { p.setF(k, e.target.value); setFocus(k); setAi(0) }}
                    onFocus={() => { setFocus(k); setAi(0) }}
                    onBlur={() => setFocus(cur => (cur === k ? null : cur))}
                    onKeyDown={onKeyDown} />
                  <div className="input-adorn">
                    {exact && <span style={{ color: '#059669', display: 'flex', padding: '0 4px' }}><Icon name="check" sw={2.5} /></span>}
                    {v && (
                      <button className="clear-btn" aria-label="Clear"
                        onMouseDown={e => { e.preventDefault(); p.setF(k, ''); setTimeout(() => refs.current[k]?.focus(), 0) }}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                  {open && (
                    <div role="listbox" className="suggest">
                      {list.map((s, i) => (
                        <div key={s.label} role="option" aria-selected={i === ai} className={'option' + (i === ai ? ' active' : '')}
                          onMouseDown={e => { e.preventDefault(); pick(k, s) }}>
                          <span style={{ color: '#71717a' }}><Icon name="mapPin" size={15} /></span>
                          <div><div style={{ fontSize: 14, fontWeight: 500 }}>{s.primary}</div><div style={{ fontSize: 12, color: '#71717a' }}>{s.secondary}</div></div>
                        </div>
                      ))}
                      {!list.length && <div style={{ padding: 10, fontSize: 13, color: '#71717a' }}>No matching places. Check the spelling.</div>}
                    </div>
                  )}
                </div>
                {err && <div className="error-text" style={{ marginTop: 6 }}>{err}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="stack-8">
        <label className="label" htmlFor="cycle" style={{ marginBottom: 0 }}>Current cycle used (hours)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input id="cycle" ref={el => { refs.current.cycle = el }} className={'input' + (errors.cycle ? ' invalid' : '')}
            style={{ width: 84, padding: '0 10px' }} type="number" min={0} max={70} step={0.25} value={f.cycle}
            disabled={disabled} placeholder="0" onChange={e => p.setF('cycle', e.target.value)} />
          <input type="range" min={0} max={70} step={0.5} value={cOk ? cn : 0} disabled={disabled} aria-label="Cycle hours used"
            style={{ flex: 1, accentColor: C.navy }} onChange={e => p.setF('cycle', e.target.value)} />
        </div>
        {errors.cycle
          ? <div className="error-text">{errors.cycle}</div>
          : <div className="helper">{cOk ? `${qh(70 - cn)} h left in your 70-hour / 8-day cycle` : 'Hours on duty in the last 8 days (0-70).'}</div>}
        {cOk && cn > 60 && !errors.cycle && (
          <div className="warn"><Icon name="alert" size={15} />A 34-hour restart may be needed on this trip.</div>
        )}
      </div>

      <div className="stack-8">
        <label className="label" htmlFor="depart" style={{ marginBottom: 0 }}>Departure</label>
        <input id="depart" className="input" type="datetime-local" value={f.depart} disabled={disabled}
          onChange={e => p.setF('depart', e.target.value)} />
        <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
          Departure and logs are in the time zone of your current location (home terminal time). The exact zone is shown after planning.
        </div>
      </div>

      <div className="collapsible">
        <button className="collapsible-head" onClick={() => setLogOpen(!logOpen)} aria-expanded={logOpen}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Log details<span className="tag">Demo</span></span>
          <span className="chev" style={{ transform: logOpen ? 'rotate(180deg)' : 'none', color: '#71717a' }}><Icon name="chevron" /></span>
        </button>
        {logOpen && (
          <div className="log-fields">
            {LOG_FIELDS.map(([k, label, wide]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: wide ? 'span 2' : 'auto' }}>
                <label className="caption" htmlFor={'log-' + k} style={{ color: '#52525b' }}>{label}</label>
                <input id={'log-' + k} className="input input-sm" value={p.log[k]} disabled={disabled}
                  placeholder={k === 'codriver' ? 'None' : ''} onChange={e => p.setLog(k, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-plan" disabled={disabled} style={{ opacity: disabled ? 0.7 : 1 }} onClick={submit}>
          {p.busy && <span className="spin"><Icon name="loader" color="#fff" /></span>}
          {p.busy ? 'Planning…' : p.isResults ? 'Update plan' : 'Plan trip'}
        </button>
        <button className="link-btn" style={{ alignSelf: 'center' }} onClick={p.onAssum}>What does the planner assume?</button>
      </div>
    </div>
  )
}
