import type { ReactNode } from 'react'
import type { LogDetails, Trip } from '../types/trip'
import { dayLabel, num, pad, qh } from '../utils/format'
import { hourToX } from '../utils/logGeometry'
import { C, STATUS } from '../utils/trip'

export const LOG_W = 1100, LOG_H = 1010

interface Props {
  trip: Trip
  day: number
  log: Partial<LogDetails>
  print?: boolean
  demo?: boolean
  dots?: boolean
  sel?: number | null
  hoverEv?: number | null
  onHover?: (ev: number, x: number, y: number) => void
  onRemark?: (ev: number) => void
}

const warned = new WeakSet<Trip>()
type TextOpts = { fs?: number; fill?: string; a?: 'start' | 'middle' | 'end'; fw?: number; it?: boolean }

/** FMCSA paper-style driver's daily log, drawn in SVG user units (LOG_W × LOG_H). */
export function LogSheet({ trip, day, log: lg, print, demo, dots, sel, hoverEv, onHover, onRemark }: Props) {
  const X0 = 150, HW = 35, X1 = X0 + 24 * HW, GY = 290, RH = 30, ink = C.ink, txt = '#111827', lab = '#3f3f46'
  const xs = (t: number) => hourToX(t, X0, 24 * HW)
  const els: ReactNode[] = []
  let k = 0
  const T = (x: number, y: number, s: string, p: TextOpts = {}) => els.push(
    <text key={k++} x={x} y={y} fontSize={p.fs || 10} fill={p.fill || txt} textAnchor={p.a || 'start'}
      fontWeight={p.fw || 400} fontStyle={p.it ? 'italic' : 'normal'}>{s}</text>)
  const TL = (x: number, y: number, arr: string[], p: TextOpts, lh = 12) => arr.forEach((s, i) => T(x, y + i * lh, s, p))
  const V = (x: number, y: number, s: string, p: TextOpts = {}) => T(x, y, s, { fill: ink, it: true, fs: 14, fw: 500, ...p })
  const Ln = (x1: number, y1: number, x2: number, y2: number, st = txt, sw = 1) =>
    els.push(<line key={k++} x1={x1} y1={y1} x2={x2} y2={y2} stroke={st} strokeWidth={sw} />)

  const ds = day * 24, de = ds + 24, t = trip.totals[day], date = trip.dates[day]

  // Header
  T(24, 42, 'Drivers Daily Log', { fs: 26, fw: 700 }); T(84, 60, '(24 hours)', { fs: 10, a: 'middle' })
  ;([[pad(date.getMonth() + 1), 340, '(month)'], [pad(date.getDate()), 435, '(day)'], [String(date.getFullYear()), 530, '(year)']] as const)
    .forEach(([v, x, l]) => { V(x, 36, v, { a: 'middle' }); Ln(x - 40, 42, x + 40, 42); T(x, 58, l, { fs: 9.5, a: 'middle', fill: lab }) })
  T(387, 40, '/', { fs: 16, a: 'middle' }); T(482, 40, '/', { fs: 16, a: 'middle' })
  T(600, 30, 'Original - File at home terminal.'); T(600, 45, 'Duplicate - Driver retains in his/her possession for 8 days.')
  T(600, 62, 'Home terminal time zone: ' + trip.tzName, { fs: 9.5, fill: lab })
  T(60, 94, 'From:', { fs: 13, fw: 600 }); V(108, 92, t.from); Ln(104, 98, 520, 98)
  T(640, 94, 'To:', { fs: 13, fw: 600 }); V(672, 92, t.to); Ln(668, 98, 1076, 98)
  els.push(<rect key={k++} x={60} y={120} width={150} height={40} fill="none" stroke={txt} />); V(135, 146, num(t.mi), { a: 'middle', fs: 16 })
  els.push(<rect key={k++} x={225} y={120} width={150} height={40} fill="none" stroke={txt} />); V(300, 146, num(t.mi), { a: 'middle', fs: 16 })
  T(135, 174, 'Total Miles Driving Today', { fs: 9, a: 'middle' }); T(300, 174, 'Total Mileage Today', { fs: 9, a: 'middle' })
  V(290, 210, (lg.truck || '-') + ' / ' + (lg.trailer || '-'), { a: 'middle' }); Ln(60, 216, 520, 216)
  TL(290, 230, ['Truck/Tractor and Trailer Numbers or', 'License Plate(s)/State (show each unit)'], { fs: 9, a: 'middle' })
  V(818, 126, lg.carrier || '', { a: 'middle' }); Ln(560, 132, 1076, 132); T(818, 146, 'Name of Carrier or Carriers', { fs: 9, a: 'middle' })
  V(818, 170, lg.office || '', { a: 'middle' }); Ln(560, 176, 1076, 176); T(818, 190, 'Main Office Address', { fs: 9, a: 'middle' })
  V(818, 214, lg.office || '', { a: 'middle' }); Ln(560, 220, 1076, 220); T(818, 234, 'Home Terminal Address', { fs: 9, a: 'middle' })

  T(60, 252, 'Driver:', { fs: 10, fw: 600 }); V(104, 250, lg.driver || '-', { fs: 12 }); Ln(100, 255, 300, 255)
  T(320, 252, 'Co-driver:', { fs: 10, fw: 600 }); V(372, 250, lg.codriver || '-', { fs: 12 }); Ln(368, 255, 520, 255)

  // Grid header bar
  els.push(<rect key={k++} x={X0 - 14} y={GY - 30} width={X1 - X0 + 28} height={30} fill={txt} />)
  for (let i = 0; i <= 24; i++) {
    const x = xs(i)
    if (i === 0 || i === 24) {
      T(x, GY - 18, 'Mid-', { fs: 8.5, fill: '#fff', a: 'middle', fw: 600 }); T(x, GY - 6, 'night', { fs: 8.5, fill: '#fff', a: 'middle', fw: 600 })
    } else T(x, GY - 7, i === 12 ? 'Noon' : String(i), { fs: 9.5, fill: '#fff', a: 'middle', fw: 600 })
  }
  T(1043, GY - 18, 'Total', { fs: 9, a: 'middle', fill: '#6b7280' }); T(1043, GY - 6, 'Hours', { fs: 9, a: 'middle', fill: '#6b7280' })

  if (!print && sel != null) {
    const x = trip.ev[sel]
    if (x && x.e > ds && x.s < de) {
      const s = Math.max(x.s, ds) - ds, e = Math.min(x.e, de) - ds
      els.push(<rect key={k++} x={xs(s)} y={GY} width={Math.max(4, (e - s) * HW)} height={4 * RH} fill="rgba(37,99,235,.09)" />)
    }
  }

  // Duty-status rows
  const rows = [['1. Off Duty'], ['2. Sleeper', 'Berth'], ['3. Driving'], ['4. On Duty', '(not driving)']]
  const keys = ['off', 'sb', 'd', 'on'] as const
  rows.forEach((r, ri) => {
    const y = GY + ri * RH
    els.push(<rect key={k++} x={X0} y={y} width={24 * HW} height={RH} fill="none" stroke={txt} />)
    const lx = print ? 24 : 30
    T(lx, y + (r[1] ? 13 : 19), r[0], { fs: 10, fw: 600 })
    if (r[1]) T(lx + 12, y + 25, r[1], { fs: 9.5, fw: 600 })
    if (!print && dots) els.push(<circle key={k++} cx={18} cy={y + (r[1] ? 9 : 15)} r={4} fill={STATUS[keys[ri]].color} />)
    for (let q = 1; q < 96; q++) {
      if (q % 4 === 0) continue
      const x = X0 + q * HW / 4
      Ln(x, y, x, y + (q % 2 ? 7 : 13), txt, 0.7)
    }
    V(1043, y + 20, qh(t[keys[ri]]), { a: 'middle', fs: 13 }); Ln(1012, y + RH - 3, 1076, y + RH - 3)
  })
  for (let i = 1; i < 24; i++) Ln(xs(i), GY, xs(i), GY + 4 * RH, txt, 0.9)
  const sum = Math.round(keys.reduce((a, k) => a + t[k], 0) * 100) / 100
  if (sum !== 24 && !warned.has(trip)) { warned.add(trip); console.error(`Log day ${day + 1} rows sum to ${sum} h, expected 24`) }
  V(1043, GY + 4 * RH + 20, '= ' + qh(sum), { a: 'middle', fs: 13 })

  // Duty line
  const seg = trip.ev.filter(x => x.e > ds && x.s < de)
    .map(x => ({ x, s: Math.max(x.s, ds) - ds, e: Math.min(x.e, de) - ds, y: GY + STATUS[x.st].row * RH + RH / 2 }))
  const dpath = seg.map((g, i) => (i ? ` V${g.y} H${xs(g.e)}` : `M${xs(g.s)} ${g.y} H${xs(g.e)}`)).join('')
  els.push(<path key={'ink-' + day} d={dpath} fill="none" stroke={ink} strokeWidth={2.5} strokeLinejoin="miter"
    {...(print ? {} : { pathLength: 1, strokeDasharray: 1, style: { animation: 'hos-draw 1.4s cubic-bezier(.16,1,.3,1) both' } })} />)
  if (!print && hoverEv != null) {
    const g = seg.find(g => g.x.i === hoverEv)
    if (g) els.push(<line key={k++} x1={xs(g.s)} y1={g.y} x2={xs(g.e)} y2={g.y} stroke={C.accent} strokeWidth={6} strokeLinecap="round" opacity={0.45} />)
  }
  if (!print && onHover) seg.forEach(g => els.push(
    <rect key={k++} x={xs(g.s)} y={g.y - 11} width={Math.max(6, (g.e - g.s) * HW)} height={22} fill="transparent" style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(g.x.i, (xs(g.s) + xs(g.e)) / 2, g.y)} />))

  // Remarks: a second ruler under the grid; each non-driving stretch hangs a bracket from it,
  // with a 45° line carrying the place above and the activity below (FMCSA example style).
  const RT = GY + 4 * RH + 24, B0 = RT + 16, B1 = B0 + 14, RY = RT + 40
  for (let i = 0; i <= 24; i++) T(xs(i), RT - 5, i === 0 || i === 24 ? 'Midnight' : i === 12 ? 'Noon' : String(i), { fs: 8.5, a: 'middle', fill: lab })
  Ln(X0, RT, X1, RT, txt, 1.2)
  for (let q = 0; q <= 96; q++) { const x = X0 + q * HW / 4; Ln(x, RT, x, RT + (q % 4 === 0 ? 11 : q % 2 === 0 ? 8 : 5), txt, 0.8) }
  T(24, RY, 'Remarks', { fs: 14, fw: 700 }); Ln(1012, GY + 4 * RH + 46, 1076, GY + 4 * RH + 46)
  els.push(<line key={k++} x1={40} y1={RY + 10} x2={40} y2={808} stroke={txt} strokeWidth={3} />); Ln(40, 808, 1076, 808, txt, 1.5)
  const grp: { loc: string; s: number; e: number; acts: typeof seg[number]['x'][] }[] = []
  seg.filter(g => g.x.k !== 'drive' && g.x.k !== 'offStart' && g.x.k !== 'offEnd').forEach(g => {
    const l = grp[grp.length - 1]
    if (l && l.loc === g.x.loc && Math.abs(l.e - g.s) < 1e-6) { l.e = g.e; l.acts.push(g.x) }
    else grp.push({ loc: g.x.loc, s: g.s, e: g.e, acts: [g.x] })
  })
  let lastX = -99, stag = 0
  grp.forEach(gr => {
    const a = xs(gr.s), b = Math.max(xs(gr.e), a + 4)
    stag = a - lastX < 40 ? stag + 1 : 0 // close neighbours: a longer stem keeps the parallel labels apart
    lastX = a
    const y = B1 + stag * 22
    const stopEv = gr.acts.find(x => x.meta.stop)
    const col = !print && stopEv && sel === stopEv.i ? C.accent : ink
    const acts = [...new Set(gr.acts.map(x => x.meta.rm).filter(Boolean))].join(' / ')
    const len = Math.max(gr.loc.length * 6, acts.length * 5) + 14
    const clickable = !print && stopEv && onRemark
    els.push(<path key={k++} d={`M${a} ${B0} V${y} M${a} ${B1} H${b} V${B0}`} fill="none" stroke={col} strokeWidth={2} />)
    els.push(
      <g key={k++} transform={`translate(${a},${y}) rotate(-45)`} style={{ cursor: clickable ? 'pointer' : 'default' }}
        onClick={clickable ? () => onRemark(stopEv.i) : undefined}>
        <line x1={-len} y1={0} x2={0} y2={0} stroke={col} strokeWidth={2} />
        <text x={-8} y={-5} fontSize={10.5} fill={col} textAnchor="end" fontWeight={600}>{gr.loc}</text>
        <text x={-8} y={12} fontSize={9.5} fill={col} textAnchor="end" fontWeight={600}>{acts}</text>
      </g>)
  })

  // Footer
  T(24, 1000, 'I certify that these entries are true and correct:', { fs: 10, fw: 600 }); V(290, 998, lg.driver || '-', { fs: 13 }); Ln(286, 1004, 560, 1004)
  TL(52, 672, ['Shipping', 'Documents:'], { fs: 11, fw: 600 }, 14)
  V(56, 716, lg.shipping || '-', { fs: 13 }); Ln(52, 722, 300, 722); TL(52, 736, ['DVL or Manifest No.', 'or'], { fs: 9.5 })
  Ln(52, 770, 300, 770); T(52, 784, 'Shipper & Commodity', { fs: 9.5 })
  T(600, 784, 'Enter name of place you reported and where released from work and when and where each change of duty occurred.', { fs: 10, a: 'middle', fw: 600 })
  T(600, 799, 'Use time standard of home terminal.', { fs: 10, a: 'middle', fw: 600 })
  TL(24, 840, ['Recap:', 'Complete at', 'end of day'], { fs: 10.5, fw: 600 }, 14)
  TL(132, 884, ['On duty', 'hours', 'today,', 'Total lines', '3 & 4'], { fs: 9.5 }); V(132, 960, qh(t.onTotal), { fs: 14 })
  TL(222, 840, ['70 Hour/', '8 Day', 'Drivers'], { fs: 10, fw: 600 }, 13)
  const col = (x: number, l: string, lines: string[], v?: string) => {
    T(x, 872, l, { fs: 15 })
    if (v != null) V(x + 24, 872, v, { fs: 14 })
    TL(x, 890, lines, { fs: 9.5 })
  }
  col(300, 'A.', ['Total', 'hours on', 'duty last 7', 'days', 'including', 'today.'])
  col(390, 'B.', ['Total', 'hours', 'available', 'tomorrow', '70 hr.', 'minus A*'])
  col(480, 'C.', ['Total', 'hours on', 'duty last 8', 'days', 'including', 'today.'], qh(t.cyc))
  TL(590, 840, ['60 Hour/ 7', 'Day Drivers'], { fs: 10, fw: 600 }, 13)
  col(680, 'A.', ['Total', 'hours on', 'duty last 6', 'days', 'including', 'today.'])
  col(770, 'B.', ['Total', 'hours', 'available', 'tomorrow', '60 hr.', 'minus A*'])
  col(860, 'C.', ['Total', 'hours on', 'duty last 7', 'days', 'including', 'today.'])
  TL(960, 840, ['*If you took', '34', 'consecutive', 'hours off', 'duty you', 'have 60/70', 'hours', 'available'], { fs: 9.5 }, 13)
  if (trip.ev.some(x => x.k === 'restart' && x.e > ds && x.e <= de))
    els.push(<path key={k++} d="M1040 846 l6 7 l12 -16" fill="none" stroke={ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)
  if (demo) {
    if (!print) els.push(<rect key={k++} x={850} y={984} width={226} height={22} rx={4} fill="#f4f4f5" />)
    T(963, 999, 'Demo values: edit in Log details', { fs: 9.5, a: 'middle', fill: '#71717a' })
  }

  return (
    <svg viewBox={`0 0 ${LOG_W} ${LOG_H}`} width="100%" role="img" aria-label={"Driver's daily log, " + dayLabel(date)}
      style={{ display: 'block', fontFamily: 'Geist, ui-sans-serif, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
      {els}
    </svg>
  )
}
