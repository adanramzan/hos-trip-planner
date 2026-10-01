// ponytail: fixture trips from the design prototype. Replace with the POST /api/trips/plan
// response once the Django HOS scheduler exists; derive() stays the single view-model builder.
import type { IconName, Place, TripDef } from '../types/trip'

const p = (lat: number, lng: number, tzOffset: number): Place => ({ ll: [lat, lng], tzOffset })

export const PLACES: Record<string, Place> = {
  'Newark, NJ': p(40.7357, -74.1724, 0), 'Philadelphia, PA': p(39.9526, -75.1652, 0), 'Columbus, OH': p(39.9612, -82.9988, 0),
  'Dayton, OH': p(39.7589, -84.1916, 0), 'Vandalia, IL': p(38.9606, -89.0937, -1), 'Kansas City, MO': p(39.0997, -94.5786, -1),
  'Burlington, CO': p(39.3061, -102.2694, -2), 'Denver, CO': p(39.7392, -104.9903, -2), 'Chicago, IL': p(41.8781, -87.6298, -1),
  'Indianapolis, IN': p(39.7684, -86.1581, 0), 'Bowling Green, KY': p(36.9685, -86.4808, -1), 'Nashville, TN': p(36.1627, -86.7816, -1),
  'Dallas, TX': p(32.7767, -96.797, -1), 'Fort Worth, TX': p(32.7555, -97.3308, -1), 'Austin, TX': p(30.2672, -97.7431, -1),
  'Chicago Heights, IL': p(41.506, -87.635, -1), 'Charlotte, NC': p(35.2271, -80.8431, 0), 'Atlanta, GA': p(33.749, -84.388, 0),
  'Memphis, TN': p(35.1495, -90.049, -1), 'Phoenix, AZ': p(33.4484, -112.074, -2), 'Houston, TX': p(29.7604, -95.3698, -1),
  'Detroit, MI': p(42.3314, -83.0458, 0), 'New York, NY': p(40.7128, -74.006, 0), 'Newark, OH': p(40.0581, -82.4013, 0),
  'Denton, TX': p(33.2148, -97.1331, -1), 'Columbia, MO': p(38.9517, -92.3341, -1), 'Daytona Beach, FL': p(29.2108, -81.0228, 0),
}

export const STATE_NAME: Record<string, string> = {
  NJ: 'New Jersey', PA: 'Pennsylvania', OH: 'Ohio', IL: 'Illinois', MO: 'Missouri', CO: 'Colorado', IN: 'Indiana',
  KY: 'Kentucky', TN: 'Tennessee', TX: 'Texas', GA: 'Georgia', NC: 'North Carolina', AZ: 'Arizona', MI: 'Michigan',
  NY: 'New York', FL: 'Florida',
}

const startDate = '2026-10-01'

export const SAMPLES: { chip: string; icon: IconName; def: TripDef }[] = [
  {
    chip: 'Short day trip', icon: 'route',
    def: {
      key: 'short', current: 'Dallas, TX', pickup: 'Fort Worth, TX', dropoff: 'Austin, TX', cycle: 10, days: 1, startDate,
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
    },
  },
  {
    chip: 'Multi-day haul', icon: 'truck',
    def: {
      key: 'multi', current: 'Newark, NJ', pickup: 'Philadelphia, PA', dropoff: 'Denver, CO', cycle: 18, days: 3, startDate,
      ev: [
        { s: 0, e: 6, st: 'off', k: 'offStart', loc: 'Newark, NJ' },
        { s: 6, e: 6.25, st: 'on', k: 'start', loc: 'Newark, NJ' },
        { s: 6.25, e: 8, st: 'd', k: 'drive', loc: 'Philadelphia, PA', mi: 100 },
        { s: 8, e: 9, st: 'on', k: 'pickup', loc: 'Philadelphia, PA' },
        { s: 9, e: 17, st: 'd', k: 'drive', loc: 'Columbus, OH', mi: 464 },
        { s: 17, e: 17.5, st: 'off', k: 'break', loc: 'Columbus, OH' },
        { s: 17.5, e: 18.75, st: 'd', k: 'drive', loc: 'Dayton, OH', mi: 72 },
        { s: 18.75, e: 19, st: 'on', k: 'post', loc: 'Dayton, OH' },
        { s: 19, e: 29, st: 'sb', k: 'rest', loc: 'Dayton, OH' },
        { s: 29, e: 29.25, st: 'on', k: 'pre', loc: 'Dayton, OH' },
        { s: 29.25, e: 34.75, st: 'd', k: 'drive', loc: 'Vandalia, IL', mi: 310 },
        { s: 34.75, e: 35.25, st: 'on', k: 'fuel', loc: 'Vandalia, IL' },
        { s: 35.25, e: 40.75, st: 'd', k: 'drive', loc: 'Kansas City, MO', mi: 320 },
        { s: 40.75, e: 41, st: 'on', k: 'post', loc: 'Kansas City, MO' },
        { s: 41, e: 51, st: 'sb', k: 'rest', loc: 'Kansas City, MO' },
        { s: 51, e: 51.25, st: 'on', k: 'pre', loc: 'Kansas City, MO' },
        { s: 51.25, e: 59.25, st: 'd', k: 'drive', loc: 'Burlington, CO', mi: 464 },
        { s: 59.25, e: 59.75, st: 'on', k: 'fuelbreak', loc: 'Burlington, CO' },
        { s: 59.75, e: 62.25, st: 'd', k: 'drive', loc: 'Denver, CO', mi: 136 },
        { s: 62.25, e: 63.25, st: 'on', k: 'dropoff', loc: 'Denver, CO' },
        { s: 63.25, e: 63.5, st: 'on', k: 'post', loc: 'Denver, CO' },
        { s: 63.5, e: 72, st: 'off', k: 'offEnd', loc: 'Denver, CO' },
      ],
    },
  },
  {
    chip: 'Near cycle limit', icon: 'history',
    def: {
      key: 'restart', current: 'Chicago, IL', pickup: 'Indianapolis, IN', dropoff: 'Nashville, TN', cycle: 62, days: 3, startDate,
      ev: [
        { s: 0, e: 6, st: 'off', k: 'offStart', loc: 'Chicago, IL' },
        { s: 6, e: 6.25, st: 'on', k: 'start', loc: 'Chicago, IL' },
        { s: 6.25, e: 9.25, st: 'd', k: 'drive', loc: 'Indianapolis, IN', mi: 180 },
        { s: 9.25, e: 10.25, st: 'on', k: 'pickup', loc: 'Indianapolis, IN' },
        { s: 10.25, e: 13.75, st: 'd', k: 'drive', loc: 'Bowling Green, KY', mi: 210 },
        { s: 13.75, e: 14, st: 'on', k: 'post', loc: 'Bowling Green, KY' },
        { s: 14, e: 48, st: 'off', k: 'restart', loc: 'Bowling Green, KY' },
        { s: 48, e: 54, st: 'off', k: 'off', loc: 'Bowling Green, KY' },
        { s: 54, e: 54.25, st: 'on', k: 'pre', loc: 'Bowling Green, KY' },
        { s: 54.25, e: 55.5, st: 'd', k: 'drive', loc: 'Nashville, TN', mi: 65 },
        { s: 55.5, e: 56.5, st: 'on', k: 'dropoff', loc: 'Nashville, TN' },
        { s: 56.5, e: 56.75, st: 'on', k: 'post', loc: 'Nashville, TN' },
        { s: 56.75, e: 72, st: 'off', k: 'offEnd', loc: 'Nashville, TN' },
      ],
    },
  },
]
