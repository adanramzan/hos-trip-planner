import type { ApiResponse, Kind, RawEvent, Status, Trip } from '../types/trip'
import { derive } from './trip'

const STATUS: Record<string, Status> = { OFF_DUTY: 'off', SLEEPER_BERTH: 'sb', DRIVING: 'd', ON_DUTY_NOT_DRIVING: 'on' }
const KIND: Record<string, Kind> = {
  PRE_TRIP_INSPECTION: 'pre', DRIVING: 'drive', PICKUP: 'pickup', DROPOFF: 'dropoff', FUEL: 'fuel', BREAK: 'break',
  POST_TRIP_INSPECTION: 'post', DAILY_REST: 'rest', CYCLE_RESTART: 'restart',
}

/** ISO instant to home-terminal wall clock, as hours since the UTC epoch of the same wall clock (machine zone never involved). */
function wallHours(tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (iso: string) => {
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map(x => [x.type, +x.value]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 36e5
  }
}

/** Converts an API response into the view model; derive() builds everything else from the events. */
export function fromApi(r: ApiResponse): Trip {
  const { trip, route, events } = r
  const wall = wallHours(trip.timezone)
  const origin = Math.floor(wall(events[0].start_time) / 24) * 24 // day-1 home midnight
  let first = true
  const ev: RawEvent[] = events.map(x => {
    const drive = x.type === 'DRIVING', at = (drive && x.end_location) || x.location // a drive sits at its destination
    let k = KIND[x.type]
    if (k === 'pre' && first) { k = 'start'; first = false }
    return { s: wall(x.start_time) - origin, e: wall(x.end_time) - origin, st: STATUS[x.duty_status], k, loc: at.name, mi: x.distance_miles ?? 0, ll: [at.lat, at.lng], utc: at.utc_offset_minutes }
  })
  const end = trip.days * 24, last = ev[ev.length - 1]
  if (ev[0].s > 0) ev.unshift({ s: 0, e: ev[0].s, st: 'off', k: 'offStart', loc: ev[0].loc })
  if (last.e < end) ev.push({ s: last.e, e: end, st: 'off', k: 'offEnd', loc: last.loc })
  const name = (k: Kind) => ev.find(x => x.k === k)?.loc ?? ''
  return derive({
    key: 'api', current: events[0].location.name, pickup: name('pickup'), dropoff: name('dropoff'), cycle: trip.cycle_used_start, days: trip.days,
    startDate: new Date(origin * 36e5).toISOString().slice(0, 10), tzName: trip.timezone, tzAbbr: trip.timezone_abbr,
    homeUtc: events[0].location.utc_offset_minutes, route: { geometry: route.geometry, pickupIndex: route.pickup_index }, ev,
  })
}
