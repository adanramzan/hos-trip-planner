import { describe, expect, it } from 'vitest'
import type { ApiResponse } from '../types/trip'
import { fromApi } from './adapter'

const NY = { lat: 40.7, lng: -74.2, utc_offset_minutes: -240 }
const loc = (name: string, utc = -240) => ({ name, lat: 1, lng: 2, utc_offset_minutes: utc })
const e = (type: string, duty_status: string, start_time: string, end_time: string, location: object, extra: object = {}) =>
  ({ type, duty_status, start_time, end_time, location, ...extra })
const ON = 'ON_DUTY_NOT_DRIVING'

const resp = {
  trip: { timezone: 'America/New_York', timezone_abbr: 'EDT', days: 2, cycle_used_start: 18 },
  route: { geometry: [[40.7, -74.2], [39.9, -75.1], [41.8, -87.6]], pickup_index: 1 },
  events: [
    e('PRE_TRIP_INSPECTION', ON, '2026-10-01T14:00:00-04:00', '2026-10-01T14:15:00-04:00', { name: 'Newark, NJ', ...NY }),
    e('DRIVING', 'DRIVING', '2026-10-01T14:15:00-04:00', '2026-10-01T16:00:00-04:00', loc('Newark, NJ'), { end_location: loc('Philadelphia, PA'), distance_miles: 100 }),
    e('PICKUP', ON, '2026-10-01T16:00:00-04:00', '2026-10-01T17:00:00-04:00', loc('Philadelphia, PA')),
    // crosses home-terminal midnight
    e('DRIVING', 'DRIVING', '2026-10-01T17:00:00-04:00', '2026-10-02T01:00:00-04:00', loc('Philadelphia, PA'), { end_location: loc('Columbus, OH'), distance_miles: 460 }),
    e('POST_TRIP_INSPECTION', ON, '2026-10-02T01:00:00-04:00', '2026-10-02T01:15:00-04:00', loc('Columbus, OH')),
    e('DAILY_REST', 'SLEEPER_BERTH', '2026-10-02T01:15:00-04:00', '2026-10-02T11:15:00-04:00', loc('Columbus, OH')),
    e('PRE_TRIP_INSPECTION', ON, '2026-10-02T11:15:00-04:00', '2026-10-02T11:30:00-04:00', loc('Columbus, OH')),
    // given in UTC on purpose: must still be read as home wall-clock 11:30 to 14:00
    e('DRIVING', 'DRIVING', '2026-10-02T15:30:00Z', '2026-10-02T18:00:00Z', loc('Columbus, OH'), { end_location: loc('Chicago, IL', -300), distance_miles: 355 }),
    e('DROPOFF', ON, '2026-10-02T14:00:00-04:00', '2026-10-02T15:00:00-04:00', loc('Chicago, IL', -300)),
    e('POST_TRIP_INSPECTION', ON, '2026-10-02T15:00:00-04:00', '2026-10-02T15:15:00-04:00', loc('Chicago, IL', -300)),
  ],
} as unknown as ApiResponse

describe('fromApi', () => {
  const t = fromApi(resp)
  it('converts events to home-zone hours, statuses and kinds, with off-duty filler', () => {
    expect(t.ev.map(x => [x.k, x.st, x.s, x.e])).toEqual([
      ['offStart', 'off', 0, 14], ['start', 'on', 14, 14.25], ['drive', 'd', 14.25, 16], ['pickup', 'on', 16, 17],
      ['drive', 'd', 17, 25], ['post', 'on', 25, 25.25], ['rest', 'sb', 25.25, 35.25], ['pre', 'on', 35.25, 35.5],
      ['drive', 'd', 35.5, 38], ['dropoff', 'on', 38, 39], ['post', 'on', 39, 39.25], ['offEnd', 'off', 39.25, 48],
    ])
  })
  it('splits days at home midnight and reads zone and cycle from the response', () => {
    expect(t.days).toBe(2)
    expect(t.totals.map(d => d.off + d.sb + d.d + d.on)).toEqual([24, 24])
    expect(t.totals[0].d).toBe(8.75)
    expect(t.tzName).toBe('America/New_York')
    expect(t.tzAbbr).toBe('EDT')
    expect(t.cycle).toBe(18)
    expect(t.startDate).toBe('2026-10-01')
  })
  it('puts a drive at its destination and keeps the stop offset', () => {
    const d = t.ev.filter(x => x.k === 'drive')
    expect(d.map(x => x.loc)).toEqual(['Philadelphia, PA', 'Columbus, OH', 'Chicago, IL'])
    expect(d.map(x => x.empty)).toEqual([true, false, false])
    expect(t.ev.find(x => x.k === 'dropoff')!.utc).toBe(-300)
    expect(t.homeUtc).toBe(-240)
  })
})
