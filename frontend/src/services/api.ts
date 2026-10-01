import type { Place, Trip, TripForm } from '../types/trip'
import { derive } from '../utils/trip'
import { PLACES, SAMPLES, STATE_NAME } from './mockData'

export type PlanErrorKind = 'noRoute' | 'unavailable' | 'timeout' | 'unexpected'

export class PlanError extends Error {
  kind: PlanErrorKind
  constructor(kind: PlanErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export const findPlace = (label: string): Place | undefined => PLACES[label.trim()]

export interface Suggestion { label: string; primary: string; secondary: string }

/** Place autocomplete. Mock: prefix match on any word of the known places. */
export function suggest(v: string): Suggestion[] {
  const q = v.trim().toLowerCase()
  if (q.length < 3) return []
  const qq = q.replace(/,/g, '')
  return Object.keys(PLACES)
    .filter(n => {
      const w = n.toLowerCase().split(/[ ,]+/)
      return w.some((_, i) => w.slice(i).join(' ').startsWith(qq)) || n.toLowerCase().startsWith(q)
    })
    .slice(0, 5)
    .map(label => {
      const [city, st] = label.split(', ')
      return { label, primary: city, secondary: (STATE_NAME[st] || st) + ', USA' }
    })
}

/** Plans a trip. Mock: picks the closest fixture after a realistic delay. */
export async function planTrip(f: TripForm): Promise<Trip> {
  await new Promise(r => setTimeout(r, 2100))
  const exact = SAMPLES.find(s => s.def.current === f.current && s.def.pickup === f.pickup && s.def.dropoff === f.dropoff)
  const def = exact?.def ?? SAMPLES.find(s => s.def.key === (parseFloat(f.cycle) > 60 ? 'restart' : 'multi'))!.def
  return derive(def, PLACES)
}
