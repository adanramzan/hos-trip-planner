import type { LogDetails, Trip } from '../types/trip'
import { dayLabel, plural } from '../utils/format'
import { Icon } from './Icon'
import { LogSheet } from './LogSheet'

export function PrintView({ trip, days, log, demo, onExit }: { trip: Trip; days: number[]; log: LogDetails; demo: boolean; onExit: () => void }) {
  return (
    <>
      <div data-noprint className="print-bar">
        <button className="btn" onClick={onExit}><Icon name="arrowLeft" />Back to results</button>
        <div style={{ fontSize: 13, color: '#71717a' }}>Print preview · US Letter portrait · {plural(days.length, 'page')}</div>
        <button className="btn btn-primary" onClick={() => window.print()}><Icon name="printer" size={15} />Print or save PDF</button>
      </div>
      <div className="print-pages">
        {days.map((d, i) => (
          <div key={d} data-page className="page">
            <div><LogSheet trip={trip} day={d} log={log} demo={demo} print /></div>
            <div className="page-foot">
              <span>{trip.current} → {trip.pickup} → {trip.dropoff} · {dayLabel(trip.dates[d])}</span>
              <span>Page {i + 1} of {days.length}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
