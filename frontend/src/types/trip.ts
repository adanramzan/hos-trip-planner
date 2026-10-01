export type Status = 'off' | 'sb' | 'd' | 'on'

export type Kind =
  | 'offStart' | 'start' | 'pre' | 'post' | 'drive' | 'pickup' | 'dropoff'
  | 'fuel' | 'fuelbreak' | 'break' | 'rest' | 'restart' | 'off' | 'offEnd'

export type IconName =
  | 'truck' | 'package' | 'flag' | 'fuel' | 'coffee' | 'bed' | 'history' | 'check' | 'checkCircle'
  | 'x' | 'chevron' | 'printer' | 'info' | 'loader' | 'pencil' | 'plus' | 'alert' | 'alertCircle'
  | 'circle' | 'route' | 'mapPin' | 'rotate' | 'arrowLeft'

export interface KindMeta {
  title: string
  reason?: string
  chip?: string
  rm?: string // remark text on the log sheet
  stop?: boolean
  icon?: IconName
  color?: string
  large?: boolean
  badge?: boolean
  ring?: boolean
}

/** Times are hours from midnight of day 1, home terminal time. */
export type LL = [number, number]

export interface RawEvent {
  s: number
  e: number
  st: Status
  k: Kind
  loc: string
  mi?: number
  ll?: LL // position of loc
  utc?: number // UTC offset of loc, minutes
}

export interface TripEvent extends Required<Omit<RawEvent, 'll' | 'utc'>>, Pick<RawEvent, 'll' | 'utc'> {
  i: number
  from: string
  day: number
  dur: number
  meta: KindMeta
  empty: boolean // driving before pickup
}

export interface TripDef {
  key: string
  current: string
  pickup: string
  dropoff: string
  cycle: number
  days: number
  startDate: string // YYYY-MM-DD, day 1 in home terminal time
  tzName: string
  tzAbbr: string
  homeUtc: number // home terminal UTC offset, minutes
  route: { geometry: LL[]; pickupIndex: number }
  ev: RawEvent[]
}

export interface DayTotals {
  off: number
  sb: number
  d: number
  on: number
  mi: number
  from: string
  to: string
  cyc: number
  onTotal: number
}

export interface Card {
  label: string
  value: string
  sub: string
  bar?: number
}

export interface Trip extends Omit<TripDef, 'ev'> {
  ev: TripEvent[]
  totals: DayTotals[]
  stops: TripEvent[]
  dates: Date[]
  miles: number
  bannerParts: string[]
  checks: { label: string; value: string }[]
  cards: Card[]
  depart: string
}

export interface LogDetails {
  driver: string
  codriver: string
  carrier: string
  office: string
  truck: string
  trailer: string
  shipping: string
}

export interface TripForm {
  current: string
  pickup: string
  dropoff: string
  cycle: string
  depart: string // datetime-local value
  ll: Partial<Record<'current' | 'pickup' | 'dropoff', LL>> // coordinates of picked suggestions
}

interface ApiLoc { name: string; lat: number; lng: number; utc_offset_minutes: number }

/** Only the response fields the client reads. */
export interface ApiResponse {
  trip: { timezone: string; timezone_abbr: string; days: number; cycle_used_start: number }
  route: { geometry: LL[]; pickup_index: number }
  events: {
    type: string; duty_status: string; start_time: string; end_time: string
    location: ApiLoc; end_location?: ApiLoc | null; distance_miles?: number | null
  }[]
}
