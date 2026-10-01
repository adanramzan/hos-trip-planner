import type { IconName } from '../types/trip'

// Lucide paths. "c:cx,cy,r" = circle, "r:x,y,w,h" = rect.
const ICONS: Record<IconName, string[]> = {
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14', 'c:17,18,2', 'c:7,18,2'],
  package: ['M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', 'M12 22V12', 'M3.29 7 12 12l8.71-5', 'm7.5 4.27 9 5.15'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  fuel: ['M3 22h12', 'M4 9h10', 'M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18', 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5'],
  coffee: ['M10 2v2', 'M14 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1', 'M6 2v2'],
  bed: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'],
  history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  check: ['M20 6 9 17l-5-5'],
  checkCircle: ['c:12,12,10', 'm9 12 2 2 4-4'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  chevron: ['m6 9 6 6 6-6'],
  printer: ['M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6', 'r:6,14,12,8'],
  info: ['c:12,12,10', 'M12 16v-4', 'M12 8h.01'],
  loader: ['M21 12a9 9 0 1 1-6.219-8.56'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'],
  plus: ['M5 12h14', 'M12 5v14'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  alertCircle: ['c:12,12,10', 'M12 8v4', 'M12 16h.01'],
  circle: ['c:12,12,7'],
  route: ['c:6,19,3', 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', 'c:18,5,3'],
  mapPin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'c:12,10,3'],
  rotate: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  arrowLeft: ['m12 19-7-7 7-7', 'M19 12H5'],
}

function shapes(name: IconName) {
  return ICONS[name].map(p => {
    if (p.startsWith('c:')) { const [cx, cy, r] = p.slice(2).split(','); return { t: 'circle', a: { cx, cy, r } } }
    if (p.startsWith('r:')) { const [x, y, width, height] = p.slice(2).split(','); return { t: 'rect', a: { x, y, width, height, rx: '1' } } }
    return { t: 'path', a: { d: p } }
  })
}

export function Icon({ name, size = 16, color = 'currentColor', sw = 2 }: { name: IconName; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      {shapes(name).map(({ t, a }, i) => {
        const Tag = t as 'path'
        return <Tag key={i} {...a} />
      })}
    </svg>
  )
}

/** Same icon as an HTML string, for Leaflet divIcons. */
export function iconHtml(name: IconName, size: number, color: string) {
  const body = shapes(name).map(({ t, a }) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${body}</svg>`
}
