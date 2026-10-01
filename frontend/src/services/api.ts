import type { ApiResponse, LL, LogDetails, Trip, TripForm } from '../types/trip'
import { fromApi } from '../utils/adapter'

export type PlanErrorKind = 'noRoute' | 'unavailable' | 'timeout' | 'unexpected'
export type LocKey = 'current' | 'pickup' | 'dropoff'

export class PlanError extends Error {
  kind: PlanErrorKind
  field?: LocKey // set for location_not_found
  constructor(kind: PlanErrorKind, message: string, field?: LocKey) {
    super(message)
    this.kind = kind
    this.field = field
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const TIMEOUT_MS = 90_000 // cold starts can take a minute

export interface Suggestion { label: string; lat: number; lng: number; primary: string; secondary: string }

/** Place autocomplete via the backend. */
export async function suggest(q: string): Promise<Suggestion[]> {
  const r = await fetch(`${BASE}/api/geocode/autocomplete?q=${encodeURIComponent(q.trim())}`)
  if (!r.ok) return []
  const { suggestions } = await r.json() as { suggestions: { label: string; lat: number; lng: number }[] }
  return suggestions.map(s => {
    const i = s.label.indexOf(',')
    return { ...s, primary: i < 0 ? s.label : s.label.slice(0, i), secondary: i < 0 ? '' : s.label.slice(i + 1).trim() }
  })
}

/** Place name for a map click; the backend falls back to a coordinate label. */
export async function reverse(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`${BASE}/api/geocode/reverse?lat=${lat}&lng=${lng}`)
    if (r.ok) return (await r.json() as { label: string }).label
  } catch { /* fall through */ }
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`
}

/** Wakes a sleeping backend. Failures are ignored. */
export const ping = () => { fetch(`${BASE}/api/health`).catch(() => {}) }

const loc = (f: TripForm, k: LocKey) => { const ll: LL | undefined = f.ll[k]; return ll ? { label: f[k], lat: ll[0], lng: ll[1] } : { label: f[k] } }

export async function planTrip(f: TripForm, log: LogDetails): Promise<Trip> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    let r: Response
    try {
      r = await fetch(`${BASE}/api/trips/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({
          current_location: loc(f, 'current'), pickup_location: loc(f, 'pickup'), dropoff_location: loc(f, 'dropoff'),
          current_cycle_used: parseFloat(f.cycle), start_datetime: f.depart + ':00', // no offset: wall-clock time at the home terminal
          log_details: {
            driver_name: log.driver, co_driver_name: log.codriver, carrier_name: log.carrier, main_office_address: log.office,
            truck_number: log.truck, trailer_number: log.trailer, shipping_document: log.shipping,
          },
        }),
      })
    } catch (err) {
      throw new PlanError((err as Error).name === 'AbortError' ? 'timeout' : 'unavailable', 'Network error')
    }
    if (!r.ok) {
      const e = (await r.json().catch(() => null))?.error as { code?: string; field?: string } | undefined
      if (e?.code === 'location_not_found') {
        const k = (['current', 'pickup', 'dropoff'] as const).find(x => e.field?.startsWith(x))
        throw new PlanError('noRoute', k ? `We couldn't find '${f[k]}'. Pick a suggestion or check the spelling.` : 'Location not found', k)
      }
      if (e?.code === 'no_route') throw new PlanError('noRoute', 'No route')
      if (e?.code === 'routing_timeout') throw new PlanError('timeout', 'Timeout')
      if (e?.code === 'routing_unavailable' || r.status >= 500) throw new PlanError('unavailable', 'Unavailable')
      throw new PlanError('unexpected', 'Unexpected response')
    }
    return fromApi(await r.json() as ApiResponse)
  } finally {
    clearTimeout(timer)
  }
}
