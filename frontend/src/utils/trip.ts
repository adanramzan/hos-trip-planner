import type { Card, DayTotals, Kind, KindMeta, Place, Status, Trip, TripDef, TripEvent } from '../types/trip'
import { c12, dayLabel, dur, fh, num, plural, qh } from './format'

export const C = {
  fg: '#09090b', muted: '#71717a', border: '#e4e4e7', navy: '#16204A', accent: '#2563EB', ink: '#1D4ED8',
  off: '#64748B', sb: '#4F46E5', d: '#059669', on: '#D97706', err: '#DC2626',
}

export const STATUS: Record<Status, { label: string; short?: string; color: string; row: number }> = {
  off: { label: 'Off Duty', color: C.off, row: 0 },
  sb: { label: 'Sleeper Berth', color: C.sb, row: 1 },
  d: { label: 'Driving', color: C.d, row: 2 },
  on: { label: 'On Duty (Not Driving)', short: 'On Duty', color: C.on, row: 3 },
}

export const KIND: Record<Kind, KindMeta> = {
  offStart: { title: 'Off duty', reason: 'Before trip' },
  start: { title: 'Start · Pre-trip inspection', stop: true, icon: 'truck', color: C.navy, large: true, reason: 'Start of duty period', chip: 'Start of duty period', rm: 'Pre-trip' },
  pre: { title: 'Pre-trip inspection', reason: 'Start of duty period', rm: 'Pre-trip' },
  post: { title: 'Post-trip inspection', reason: 'End of duty period', rm: 'Post-trip' },
  drive: { title: 'Drive' },
  pickup: { title: 'Pickup', stop: true, icon: 'package', color: C.on, large: true, reason: 'Pickup: 1 hour loading', chip: '1 hour loading', rm: 'Pickup' },
  dropoff: { title: 'Dropoff', stop: true, icon: 'flag', color: C.on, large: true, reason: 'Dropoff: 1 hour unloading', chip: '1 hour unloading', rm: 'Dropoff' },
  fuel: { title: 'Fuel', stop: true, icon: 'fuel', color: C.on, reason: 'Fuel: due before 1,000 miles', chip: 'Due before 1,000 mi', rm: 'Fuel' },
  fuelbreak: { title: 'Fuel + break', stop: true, icon: 'fuel', badge: true, color: C.on, reason: 'Fuel stop: also covers the 30-minute break', chip: 'Also covers 30-min break', rm: 'Fuel + break' },
  break: { title: '30-minute break', stop: true, icon: 'coffee', color: C.off, reason: '30-minute break: 8 hours of driving reached', chip: '8 h of driving reached', rm: '30-min break' },
  rest: { title: '10-hour rest', stop: true, icon: 'bed', color: C.sb, reason: '10-hour rest: 11-hour driving limit reached', chip: '11-hour driving limit reached', rm: '10-h rest' },
  restart: { title: '34-hour restart', stop: true, icon: 'history', ring: true, color: C.off, reason: '34-hour restart: 70-hour cycle reached', chip: '70-hour cycle reached', rm: '34-h restart' },
  off: { title: 'Off duty', reason: 'Resting before departure', rm: 'Off duty' },
  offEnd: { title: 'Off duty', reason: 'Trip complete' },
}

export const TZ: Record<number, [string, string]> = {
  0: ['America/New_York', 'EDT'],
  [-1]: ['America/Chicago', 'CDT'],
  [-2]: ['America/Denver', 'MDT'],
}

/** "Thu Oct 1, 6:00 AM" for an hour offset into the trip. */
export function dt(trip: Pick<Trip, 'dates'>, t: number) {
  const d = Math.floor(Math.round(t * 60) / 1440)
  return dayLabel(trip.dates[d]) + ', ' + c12(t)
}

/** Builds every view-model number from the canonical event list. */
export function derive(def: TripDef, places: Record<string, Place>): Trip {
  const pk = def.ev.findIndex(x => x.k === 'pickup')
  let prev = def.current
  const ev: TripEvent[] = def.ev.map((a, i) => {
    const x: TripEvent = {
      ...a, mi: a.mi || 0, i, from: prev, day: Math.floor(a.s / 24 + 1e-9), dur: a.e - a.s,
      meta: KIND[a.k], empty: a.k === 'drive' && i < pk,
    }
    prev = a.loc
    return x
  })

  const [y, m, d0] = def.startDate.split('-').map(Number)
  const dates = Array.from({ length: def.days }, (_, d) => new Date(y, m - 1, d0 + d))

  const totals: DayTotals[] = []
  let cyc = def.cycle
  for (let d = 0; d < def.days; d++) {
    const ds = d * 24, de = ds + 24
    const t = { off: 0, sb: 0, d: 0, on: 0, mi: 0 }
    const ov = ev.filter(x => x.e > ds && x.s < de)
    ov.forEach(x => {
      const o = Math.min(x.e, de) - Math.max(x.s, ds)
      t[x.st] += o
      if (x.k === 'drive' && x.day === d) t.mi += x.mi
      if (x.st === 'd' || x.st === 'on') cyc += o
      if (x.k === 'restart' && x.e <= de) cyc = 0
    })
    const nd = ov.filter(x => x.k !== 'drive')
    totals.push({ ...t, from: nd[0]?.loc ?? '', to: nd[nd.length - 1]?.loc ?? '', cyc, onTotal: t.d + t.on })
  }

  // Peak values for the rule-check panel.
  let mD = 0, mW = 0, mB = 0, mF = 0, sd = 0, sb = 0, sf = 0, mc = def.cycle, cc = def.cycle
  let ss: number | null = null
  ev.forEach(x => {
    if (x.k === 'start' || x.k === 'pre') { ss = x.s; sd = 0; sb = 0 }
    if (x.st === 'd') { sd += x.dur; sb += x.dur; sf += x.mi; mD = Math.max(mD, sd); mB = Math.max(mB, sb); mF = Math.max(mF, sf) }
    else if (x.dur >= 0.5) sb = 0
    if (x.k === 'fuel' || x.k === 'fuelbreak') sf = 0
    if (x.k === 'post' && ss != null) mW = Math.max(mW, x.e - ss)
    if (x.st === 'd' || x.st === 'on') { cc += x.dur; mc = Math.max(mc, cc) }
    if (x.k === 'restart') cc = 0
  })

  const stops = ev.filter(x => x.meta.stop)
  const cnt = (ks: Kind[]) => ev.filter(x => ks.includes(x.k)).length
  const rests = cnt(['rest']), fuels = cnt(['fuel', 'fuelbreak']), breaks = cnt(['break']), restarts = cnt(['restart'])
  const drive = ev.filter(x => x.k === 'drive')
  const miles = drive.reduce((a, x) => a + x.mi, 0)
  const emptyMi = drive.filter(x => x.empty).reduce((a, x) => a + x.mi, 0)
  const first = ev.find(x => x.k === 'start')!
  const drop = ev.find(x => x.k === 'dropoff')!
  const lastPost = ev.filter(x => x.k === 'post').pop()!
  const home = places[def.current].tzOffset
  const [tzName, tzAbbr] = TZ[home]
  const last = totals[totals.length - 1]
  const ctx = { dates }

  const bannerParts = [plural(def.days, 'day')]
  if (rests) bannerParts.push(plural(rests, 'rest'))
  if (restarts) bannerParts.push(plural(restarts, '34-hour restart'))
  if (fuels) bannerParts.push(plural(fuels, 'fuel stop'))
  if (breaks) bannerParts.push(plural(breaks, 'break'))
  if (!rests && !fuels && !breaks && !restarts) bannerParts.push('no rests needed')

  const sp: string[] = []
  if (fuels) sp.push(fuels + ' fuel')
  if (breaks) sp.push(breaks + ' break')
  if (rests) sp.push(plural(rests, 'rest'))
  if (restarts) sp.push(restarts + ' restart')
  sp.push('pickup', 'dropoff')

  const dropTz = places[drop.loc].tzOffset
  const dropOff = dropTz - home
  const cards: Card[] = [
    { label: 'Total distance', value: num(miles) + ' mi', sub: `2 legs: ${num(emptyMi)} mi + ${num(miles - emptyMi)} mi` },
    { label: 'Driving time', value: dur(drive.reduce((a, x) => a + x.dur, 0)), sub: 'Truck route estimate' },
    { label: 'Trip duration', value: dur(lastPost.e - first.s), sub: 'Departure to off duty' },
    { label: 'Arrival at dropoff', value: dt(ctx, drop.s) + ' ' + tzAbbr, sub: dropOff ? `${c12(drop.s + dropOff)} local (${TZ[dropTz][1]})` : 'Same as home terminal time' },
    { label: 'Stops', value: String(stops.length - 1), sub: sp.join(', ') },
    { label: 'Cycle at end', value: qh(last.cyc) + ' of 70 h', sub: qh(70 - last.cyc) + ' h left', bar: last.cyc / 70 },
  ]

  return {
    ...def, ev, totals, stops, places, dates, tzName, tzAbbr, miles, bannerParts, cards,
    checks: [
      { label: '11-hour driving', value: `Max ${fh(mD)} of 11 h` },
      { label: '14-hour window', value: `Max ${fh(mW)} of 14 h` },
      { label: '30-minute break', value: `Max ${fh(mB)} driving of 8 h` },
      { label: '70-hour / 8-day cycle', value: `Max ${fh(mc)} of 70 h` },
      { label: 'Fuel within 1,000 mi', value: `Max ${num(mF)} mi of 1,000` },
    ],
    depart: dt(ctx, first.s) + ' ' + tzAbbr,
  }
}
