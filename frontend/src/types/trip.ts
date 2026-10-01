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
export interface RawEvent {
  s: number
  e: number
  st: Status
  k: Kind
  loc: string
  mi?: number
}

export interface TripEvent extends Required<RawEvent> {
  i: number
  from: string
  day: number
  dur: number
  meta: KindMeta
  empty: boolean // driving before pickup
}

export interface Place {
  ll: [number, number]
  tzOffset: number // hours relative to Eastern
}

export interface TripDef {
  key: string
  current: string
  pickup: string
  dropoff: string
  cycle: number
  days: number
  startDate: string // YYYY-MM-DD, day 1 in home terminal time
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
  places: Record<string, Place>
  dates: Date[]
  tzName: string
  tzAbbr: string
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
  depart: string
}
