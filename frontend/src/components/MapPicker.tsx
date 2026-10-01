import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { reverse } from '../services/api'
import type { Suggestion } from '../services/api'
import type { LL } from '../types/trip'
import { Icon } from './Icon'

function Clicks({ on }: { on: (p: LL) => void }) {
  useMapEvents({ click: e => on([e.latlng.lat, e.latlng.lng]) })
  return null
}

/** Modal map: click to drop a pin, name comes from the backend reverse geocoder. */
export function MapPicker({ ll, onUse, onClose }: { ll?: LL; onUse: (s: Suggestion) => void; onClose: () => void }) {
  const [pt, setPt] = useState<LL | null>(ll ?? null)
  const [res, setRes] = useState<{ p: LL; n: string } | null>(null)
  const name = res && res.p === pt ? res.n : null

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    if (!pt) return
    let stale = false
    reverse(pt[0], pt[1]).then(n => { if (!stale) setRes({ p: pt, n }) })
    return () => { stale = true }
  }, [pt])

  return createPortal(
    <div className="scrim picker-scrim" onClick={onClose}>
      <div className="popover picker" role="dialog" aria-modal="true" aria-label="Pick a location on the map" onClick={e => e.stopPropagation()}>
        <div className="drawer-head" style={{ padding: 0 }}>
          <strong style={{ fontSize: 15 }}>Pick on map</strong>
          <button className="icon-btn sm" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="picker-map">
          <MapContainer center={ll ?? [39.5, -95]} zoom={ll ? 9 : 4} style={{ position: 'absolute', inset: 0 }}>
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
            <Clicks on={setPt} />
            {pt && <Marker position={pt} />}
          </MapContainer>
        </div>
        <div style={{ fontSize: 13, color: '#52525b', minHeight: 20 }}>
          {!pt ? 'Click the map to choose a place.' : name ?? 'Looking up…'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!pt || !name}
            onClick={() => pt && name && onUse({ label: name, lat: pt[0], lng: pt[1], primary: name, secondary: '' })}>Use this location</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
