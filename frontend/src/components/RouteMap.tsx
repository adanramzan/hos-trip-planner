import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl } from 'react-leaflet'
import type { Trip, TripEvent } from '../types/trip'
import { c12, dur } from '../utils/format'
import { C, dt, STATUS, utcLabel } from '../utils/trip'
import { Icon, iconHtml } from './Icon'

interface Props {
  trip: Trip
  dayFilter: 'all' | number
  sel: number | null
  hoverStop: number | null
  onSelect: (i: number) => void
  onClearSel: () => void
  onViewLog: (day: number) => void
}

function markerIcon(x: TripEvent, sel: boolean, hov: boolean) {
  const m = x.meta, sz = m.large ? 36 : 28, is = m.large ? 17 : 14, color = m.color!
  const sh = '0 1px 3px rgba(15,23,42,.35)' + (m.ring ? `,0 0 0 2px #fff,0 0 0 4px ${color}` : '') + (sel ? `,0 0 0 ${m.ring ? 8 : 5}px rgba(37,99,235,.35)` : '')
  const badge = m.badge
    ? `<span style="position:absolute;right:-6px;top:-6px;width:17px;height:17px;border-radius:50%;background:#fff;border:1.5px solid ${color};display:flex;align-items:center;justify-content:center">${iconHtml('coffee', 10, color)}</span>`
    : ''
  const html = `<div role="img" aria-label="${m.title}, ${x.loc}" style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:${sh};display:flex;align-items:center;justify-content:center;transform:scale(${sel ? 1.18 : hov ? 1.12 : 1});transition:transform 160ms cubic-bezier(.23,1,.32,1)">${iconHtml(m.icon!, is, '#fff')}${badge}</div>`
  return L.divIcon({ html, className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2 - 2] })
}

export function RouteMap({ trip, dayFilter, sel, hoverStop, onSelect, onClearSel, onViewLog }: Props) {
  const [map, setMap] = useState<L.Map | null>(null)
  const markers = useRef(new Map<number, L.Marker>())
  const selRef = useRef(sel)
  const vis = (d: number) => dayFilter === 'all' || dayFilter === d
  const { geometry: g, pickupIndex: pi } = trip.route

  useEffect(() => {
    const day = trip.stops.filter(x => x.ll && (dayFilter === 'all' || dayFilter === x.day)).map(x => x.ll!)
    const pts = dayFilter === 'all' || !day.length ? trip.route.geometry : day
    if (map && pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 8 })
  }, [map, trip, dayFilter])

  useEffect(() => {
    selRef.current = sel // read by popupclose so switching markers doesn't clear the new selection
    if (!map) return
    if (sel == null) map.closePopup()
    else markers.current.get(sel)?.openPopup()
  }, [map, sel])

  return (
    <MapContainer ref={setMap} center={[39.5, -95]} zoom={4} zoomControl={false} style={{ position: 'absolute', inset: 0 }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
      <ZoomControl position="bottomright" />
      {/* ponytail: the response has one polyline, not one per drive, so days are not dimmed; only markers filter. */}
      {[g.slice(0, pi + 1), g.slice(pi)].map((pos, i) => [
        <Polyline key={i + 'w'} positions={pos} pathOptions={{ color: '#fff', weight: 8 }} />,
        <Polyline key={i + 'b'} positions={pos} pathOptions={{ color: C.accent, weight: 4, dashArray: i === 0 ? '2 9' : undefined, lineCap: 'round' }} />,
      ])}
      {trip.stops.filter(x => vis(x.day)).map(x => {
        const st = STATUS[x.st], m = x.meta, isSel = sel === x.i
        const lo = (x.utc ?? trip.homeUtc) - trip.homeUtc // minutes
        return (
          <Marker key={x.i} position={x.ll!} icon={markerIcon(x, isSel, hoverStop === x.i)} title={`${m.title}, ${x.loc}`}
            zIndexOffset={isSel ? 1000 : m.large ? 500 : 0}
            ref={mk => { if (mk) markers.current.set(x.i, mk); else markers.current.delete(x.i) }}
            eventHandlers={{ click: () => onSelect(x.i), popupclose: () => { if (selRef.current === x.i) onClearSel() } }}>
            <Popup maxWidth={290} autoPanPadding={[40, 40]}>
              <div className="popup">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <div className="popup-icon" style={{ background: m.color }}><Icon name={m.icon!} size={15} color="#fff" /></div>
                  <div><div style={{ fontWeight: 600, fontSize: 14 }}>{m.title}</div><div style={{ fontSize: 12, color: '#71717a' }}>{x.loc}</div></div>
                </div>
                <div className="popup-grid">
                  <span className="muted">Arrival</span>
                  <span>
                    {dt(trip, x.s)} {trip.tzAbbr}
                    {lo !== 0 && <><br /><span className="muted">{c12(x.s + lo / 60)} local ({utcLabel(x.utc!)})</span></>}
                  </span>
                  <span className="muted">Duration</span><span>{dur(x.dur)}</span>
                  <span className="muted">Status</span>
                  <span><span className="status-badge"><span className="dot" style={{ background: st.color }} />{st.label}</span></span>
                </div>
                <div className="popup-reason">{m.reason}</div>
                <button className="btn popup-btn" onClick={() => onViewLog(x.day)}>View on Day {x.day + 1} log →</button>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
