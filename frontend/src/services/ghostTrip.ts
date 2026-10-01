// Static decoration only: the sample log sheet behind the empty-state hero. Not real planner output.
import type { Trip } from '../types/trip'
import { derive } from '../utils/trip'

export const GHOST_TRIP: Trip = derive({
  key: 'ghost', current: 'Dallas, TX', pickup: 'Fort Worth, TX', dropoff: 'Austin, TX', cycle: 10, days: 1, startDate: '2026-10-01',
  tzName: 'America/Chicago', tzAbbr: 'CDT', homeUtc: -300, route: { geometry: [], pickupIndex: 0 },
  ev: [
    { s: 0, e: 6, st: 'off', k: 'offStart', loc: 'Dallas, TX' },
    { s: 6, e: 6.25, st: 'on', k: 'start', loc: 'Dallas, TX' },
    { s: 6.25, e: 7.25, st: 'd', k: 'drive', loc: 'Fort Worth, TX', mi: 35 },
    { s: 7.25, e: 8.25, st: 'on', k: 'pickup', loc: 'Fort Worth, TX' },
    { s: 8.25, e: 11.75, st: 'd', k: 'drive', loc: 'Austin, TX', mi: 195 },
    { s: 11.75, e: 12.75, st: 'on', k: 'dropoff', loc: 'Austin, TX' },
    { s: 12.75, e: 13, st: 'on', k: 'post', loc: 'Austin, TX' },
    { s: 13, e: 24, st: 'off', k: 'offEnd', loc: 'Austin, TX' },
  ],
})
