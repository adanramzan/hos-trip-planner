export const pad = (n: number) => String(n).padStart(2, '0')

/** Hours → "HH:MM" (24h). */
export function c24(t: number) {
  const m = Math.round(t * 60)
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60)
}

/** Hours → "h:MM AM" wrapped to one day. */
export function c12(t: number) {
  let m = Math.round(t * 60) % 1440
  if (m < 0) m += 1440
  const h = Math.floor(m / 60)
  return ((h % 12) || 12) + ':' + pad(m % 60) + ' ' + (h < 12 ? 'AM' : 'PM')
}

/** Hours → "2 h 15 m". */
export function dur(h: number) {
  const m = Math.round(h * 60), H = Math.floor(m / 60), M = m % 60
  return H && M ? `${H} h ${M} m` : H ? `${H} h` : `${M} m`
}

export const qh = (h: number) => String(Math.round(h * 100) / 100)
export const fh = (h: number) => qh(h) + ' h'
export const num = (n: number) => n.toLocaleString('en-US')
export const plural = (n: number, w: string, p?: string) => n + ' ' + (n === 1 ? w : (p || w + 's'))

/** "Thu Oct 1" */
export const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
