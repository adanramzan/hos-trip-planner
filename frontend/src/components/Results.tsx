import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LogDetails, Trip } from '../types/trip'
import { c24, dayLabel, dur, fh, num, qh } from '../utils/format'
import { C, dt, STATUS } from '../utils/trip'
import { Icon } from './Icon'
import { LOG_H, LOG_W, LogSheet } from './LogSheet'
import { RouteMap } from './RouteMap'

type Section = 'summary' | 'route' | 'logs'

interface Props {
  trip: Trip
  log: LogDetails
  demo: boolean
  replanning: boolean
  side: ReactNode // the trip form, kept beside the results so any field can be changed in place
  sideOpen: boolean
  onToggleSide: () => void
  onNew: () => void
  onAssum: () => void
  onPrint: (days: number[]) => void
}

const LEGEND = (['off', 'sb', 'd', 'on'] as const).map(k => ({ label: STATUS[k].short || STATUS[k].label, color: STATUS[k].color }))

export function Results({ trip, log, demo, replanning, side, sideOpen, onToggleSide, onNew, onAssum, onPrint }: Props) {
  const [sel, setSel] = useState<number | null>(null)
  const [hoverStop, setHoverStop] = useState<number | null>(null)
  const [dayFilter, setDayFilter] = useState<'all' | number>('all')
  const [logDay, setLogDay] = useState(0)
  const [logsView, setLogsView] = useState<'one' | 'all'>('one')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [tip, setTip] = useState<{ day: number; ev: number; x: number; y: number } | null>(null)
  const [active, setActive] = useState<Section>('summary')
  const refs = useRef<Partial<Record<Section, HTMLElement | null>>>({})
  const tl = useRef<HTMLDivElement>(null)
  const days = [...Array(trip.days).keys()]
  const label = (d: number) => `Day ${d + 1} · ${dayLabel(trip.dates[d])}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    const onScroll = () => {
      let a: Section = 'summary'
      ;(['route', 'logs'] as const).forEach(k => { const el = refs.current[k]; if (el && el.getBoundingClientRect().top < 140) a = k })
      setActive(a)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll) }
  }, [])

  const scrollTo = (k: Section) => {
    const el = refs.current[k]
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }
  const viewLog = (d: number) => { setLogDay(d); setLogsView('one'); setActive('logs'); setTimeout(() => scrollTo('logs')) }
  const selectFromMap = (i: number) => {
    setSel(i)
    setTimeout(() => {
      const el = tl.current?.querySelector<HTMLElement>(`[data-stop="${i}"]`)
      if (el && tl.current) tl.current.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' })
    })
  }

  const arrival = trip.cards[3]
  const cards = trip.cards.filter((_, i) => i !== 3)

  return (
    <>
      <div className="resbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div className="logo"><Icon name="truck" color="#fff" /></div>
          <div style={{ minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{trip.current} → {trip.pickup} → {trip.dropoff}</div>
            <div className="ellipsis mono" style={{ fontSize: 12, color: '#94a3b8' }}>Cycle {trip.cycle} h · Departs {trip.depart}</div>
          </div>
        </div>
        <nav style={{ display: 'flex', gap: 4, height: 64 }}>
          {([['summary', 'Summary'], ['route', 'Route'], ['logs', 'Daily logs']] as const).map(([k, l]) => (
            <button key={k} className="nav-btn" style={{ color: active === k ? '#fff' : '#94a3b8', boxShadow: `inset 0 -2px 0 ${active === k ? '#60a5fa' : 'transparent'}` }}
              onClick={() => { setActive(k); scrollTo(k) }}>{l}</button>
          ))}
        </nav>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-dark-ghost" style={{ padding: '0 10px' }} onClick={onAssum} title="Assumptions" aria-label="Assumptions"><Icon name="info" /></button>
          <button className="btn-dark-outline" onClick={onToggleSide} aria-expanded={sideOpen}><Icon name={sideOpen ? "x" : "pencil"} size={15} />{sideOpen ? "Hide form" : "Edit trip"}</button>
          <button className="btn-dark-ghost" onClick={onNew}><Icon name="plus" />New trip</button>
        </div>
      </div>
      {replanning && <div className="replan-bar"><div className="indet" /></div>}

      <main className="main" style={{ gridTemplateColumns: sideOpen ? '440px minmax(0,1fr)' : 'minmax(0,1fr)' }}>
        <aside className="side" hidden={!sideOpen}>{side}</aside>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, minWidth: 0, opacity: replanning ? 0.55 : 1, transition: 'opacity 200ms ease' }}>

          <section ref={el => { refs.current.summary = el }} className="section" style={{ gap: 16 }}>
            <div className="banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <span className="banner-check"><span className="ring" /><span className="dot"><Icon name="check" sw={2.5} /></span></span>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 18px', fontSize: 14, color: '#064e3b' }}>
                  <span style={{ fontWeight: 600 }}>HOS-compliant plan</span>
                  {trip.bannerParts.map(b => <span key={b} style={{ color: '#047857' }}>{b}</span>)}
                </div>
                <button className="banner-btn" onClick={() => setRulesOpen(!rulesOpen)} aria-expanded={rulesOpen}>
                  {rulesOpen ? 'Hide rule checks' : 'See rule checks'}
                  <span className="chev" style={{ transform: rulesOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevron" /></span>
                </button>
              </div>
              {rulesOpen && (
                <div className="checks">
                  {trip.checks.map(ck => (
                    <div key={ck.label} className="check">
                      <span style={{ color: '#059669', paddingTop: 1 }}><Icon name="check" sw={2.5} /></span>
                      <div><div style={{ fontSize: 13, fontWeight: 500, color: '#064e3b' }}>{ck.label}</div><div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>{ck.value}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="stats">
              <div className="stat-hero">
                <div style={{ fontSize: 13, color: '#52525b' }}>Arrives at dropoff</div>
                <div className="arrival">{arrival.value}</div>
                <div style={{ fontSize: 13, color: '#52525b' }}>{arrival.sub}</div>
              </div>
              {cards.map((cd, i) => (
                <div key={cd.label} className="stat" style={{ animationDelay: 80 + i * 40 + 'ms' }}>
                  <div style={{ fontSize: 13, color: '#52525b' }}>{cd.label}</div>
                  <div className="stat-value">{cd.value}</div>
                  {cd.bar != null && (
                    <div className="bar"><div style={{ width: (cd.bar * 100).toFixed(1) + '%', background: cd.bar > 0.85 ? C.on : C.navy }} /></div>
                  )}
                  <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.4, textWrap: 'pretty' }}>{cd.sub}</div>
                </div>
              ))}
            </div>
          </section>

          <section ref={el => { refs.current.route = el }} className="section" style={{ gap: 14, animationDelay: '60ms' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <h2 className="h2">Route</h2>
              <div role="tablist" style={{ display: 'flex', gap: 6 }}>
                {(['all', ...days] as const).map(k => {
                  const a = dayFilter === k
                  return (
                    <button key={k} role="tab" aria-selected={a} className={'chip' + (a ? ' active' : '')}
                      onClick={() => {
                        setDayFilter(k)
                        if (sel != null && k !== 'all' && trip.ev[sel].day !== k) setSel(null)
                      }}>{k === 'all' ? 'All' : `Day ${k + 1}`}</button>
                  )
                })}
              </div>
            </div>
            <div className="route-grid">
              <div className="map-wrap">
                <RouteMap trip={trip} dayFilter={dayFilter} sel={sel} hoverStop={hoverStop} onSelect={selectFromMap} onClearSel={() => setSel(null)} onViewLog={viewLog} />
                <div className="legend">
                  {LEGEND.map(lg => <div key={lg.label} className="legend-row"><span className="dot" style={{ width: 10, height: 10, background: lg.color }} />{lg.label}</div>)}
                  <div style={{ height: 1, background: '#e4e4e7', margin: '2px 0' }} />
                  <div className="legend-row"><span style={{ width: 18, borderTop: '3px dashed #2563EB' }} />Empty to pickup</div>
                  <div className="legend-row"><span style={{ width: 18, borderTop: '3px solid #2563EB' }} />Loaded to dropoff</div>
                </div>
              </div>
              <div ref={tl} className="timeline">
                {days.filter(d => dayFilter === 'all' || dayFilter === d).map(d => {
                  const t = trip.totals[d]
                  const items = trip.ev.filter(x => x.day === d && x.k !== 'offStart' && x.k !== 'offEnd')
                  return (
                    <div key={d}>
                      <div className="tl-head">
                        <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{label(d)}</div><div style={{ fontSize: 12, color: '#71717a' }}>{num(t.mi)} mi, {fh(t.d)} driving</div></div>
                        <button className="tl-link" onClick={() => viewLog(d)}>View log →</button>
                      </div>
                      {!items.length && <div style={{ padding: '14px 16px', fontSize: 13, color: '#71717a' }}>Off duty all day: the 34-hour restart continues.</div>}
                      {items.map(x => {
                        const m = x.meta, stop = !!m.stop, isSel = sel === x.i, st = STATUS[x.st]
                        const eRel = x.e - d * 24
                        const t1 = eRel > 24 ? `${c24(eRel - 24 * Math.floor(eRel / 24))} +${Math.floor(eRel / 24)}` : c24(eRel)
                        return (
                          <div key={x.i} data-stop={x.i} className={'tl-item' + (stop ? ' stop' : '')}
                            style={{ boxShadow: `inset 0 0 0 1px ${isSel ? C.accent : 'transparent'}`, background: isSel ? '#eff6ff' : undefined }}
                            onClick={stop ? () => setSel(x.i) : undefined}
                            onMouseEnter={stop ? () => setHoverStop(x.i) : undefined}
                            onMouseLeave={stop ? () => setHoverStop(null) : undefined}>
                            <div className="tl-time" style={{ paddingTop: stop ? 5 : 0 }}><div style={{ fontWeight: 500, color: '#09090b' }}>{c24(x.s - d * 24)}</div><div>{t1}</div></div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              {stop
                                ? <span className="tl-icon" style={{ background: m.color, boxShadow: m.ring ? `0 0 0 2px #fff,0 0 0 3.5px ${m.color}` : 'none' }}><Icon name={m.icon!} size={14} color="#fff" /></span>
                                : <span className="tl-bar" style={{ background: st.color }} />}
                            </div>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {stop ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                                    <span className="status-badge"><span className="dot" style={{ background: st.color }} />{st.short || st.label}</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: '#71717a' }}>{x.loc} · {dur(x.dur)}</div>
                                  <div><span className="tl-chip">{m.chip || m.reason}</span></div>
                                </>
                              ) : (
                                <div style={{ fontSize: 13, color: '#52525b', paddingTop: 1 }}>
                                  {x.k === 'drive' ? `Drive ${dur(x.dur)}, ${x.mi} mi to ${x.loc}` : `${m.title}, ${dur(x.dur)}`}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section ref={el => { refs.current.logs = el }} className="section" style={{ gap: 16, paddingBottom: 64, animationDelay: '120ms' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="h2">Daily logs</h2>
                <span className="count">{trip.days}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="segmented">
                  {([['one', 'One day'], ['all', 'All days']] as const).map(([k, l]) => (
                    <button key={k} className={logsView === k ? 'active' : ''} onClick={() => { setLogsView(k); setTip(null) }}>{l}</button>
                  ))}
                </div>
                <button className="btn btn-sm2" onClick={() => onPrint([logDay])}><Icon name="printer" size={15} />Print this day</button>
                <button className="btn btn-sm2" onClick={() => onPrint(days)}>Print all logs</button>
              </div>
            </div>
            <div role="tablist" className="tabs">
              {days.map(d => {
                const a = logsView === 'one' && logDay === d
                return (
                  <button key={d} role="tab" aria-selected={a} style={{ color: a ? C.fg : C.muted, boxShadow: `inset 0 -2px 0 ${a ? C.navy : 'transparent'}` }}
                    onClick={() => {
                      if (logsView === 'all') {
                        const el = document.querySelector(`[data-logday="${d}"]`)
                        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' })
                      } else { setLogDay(d); setTip(null) }
                    }}>{label(d)}</button>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
              {(logsView === 'all' ? days : [logDay]).map(d => {
                const t = trip.totals[d]
                const tp = tip && tip.day === d ? tip : null
                const tx = tp ? trip.ev[tp.ev] : null
                return (
                  <div key={d} data-logday={d} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1150, animation: 'hos-fade 200ms ease both' }}>
                    {logsView === 'all' && <div style={{ fontSize: 14, fontWeight: 600 }}>{label(d)}</div>}
                    <div className="paper">
                      <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
                        <LogSheet trip={trip} day={d} log={log} demo={demo} dots sel={sel} hoverEv={tp ? tp.ev : null}
                          onHover={(ev, x, y) => setTip({ day: d, ev, x, y })}
                          onRemark={i => { setSel(i); setDayFilter('all'); setTimeout(() => scrollTo('route')) }} />
                        {tx && tp && (
                          <div className="tip" style={{ left: (tp.x / LOG_W * 100) + '%', top: (tp.y / LOG_H * 100) + '%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><span className="dot" style={{ width: 8, height: 8, background: STATUS[tx.st].color }} />{STATUS[tx.st].label}</div>
                            <div style={{ color: '#d4d4d8' }}>{dt(trip, tx.s)} to {dt(trip, tx.e)} ({dur(tx.dur)})</div>
                            <div>{tx.k === 'drive' ? `${tx.from} → ${tx.loc}, ${tx.mi} mi` : tx.loc}</div>
                            <div style={{ color: '#a1a1aa' }}>{tx.meta.reason || tx.meta.title}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="day-stats">
                      {[['Miles driven', num(t.mi) + ' mi'], ['Driving', fh(t.d)], ['On duty (incl. driving)', fh(t.onTotal)], ['Cycle used at end of day', qh(t.cyc) + ' of 70 h']].map(([l, v]) => (
                        <div key={l}><div style={{ fontSize: 12, color: '#71717a' }}>{l}</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
                      ))}
                    </div>
                    <div className="table">
                      <div className="tr th"><div>Time</div><div>Location</div><div>Activity</div><div style={{ textAlign: 'right' }}>Duration</div></div>
                      {trip.ev.filter(x => x.e > d * 24 && x.s < d * 24 + 24).map(x => {
                        const a = Math.max(x.s, d * 24) - d * 24, b = Math.min(x.e, d * 24 + 24) - d * 24
                        return (
                          <div key={x.i} className="tr">
                            <div style={{ color: '#52525b' }}>{c24(a)}-{c24(b)}</div>
                            <div>{x.k === 'drive' ? `${x.from} → ${x.loc}` : x.loc}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="dot" style={{ background: STATUS[x.st].color }} />{x.k === 'drive' ? `Driving · ${x.mi} mi` : x.meta.title}</div>
                            <div style={{ textAlign: 'right', color: '#52525b' }}>{dur(b - a)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
