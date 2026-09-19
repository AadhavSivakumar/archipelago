import * as THREE from 'three'
import { COUNTRIES } from './worldCountries'

/**
 * The Earth, painted onto the globe from the same outlines the map is cut
 * from.
 *
 * The monument's globe used to wear six green ellipsoids for continents,
 * which is what made it read as a toy however finely the sphere beneath was
 * tessellated: the shapes were wrong, and a wrong shape is recognised before
 * a coarse one. The country outlines that build the Geographical Garden's map
 * are already in the bundle, so the globe can wear the real coastlines at no
 * cost in download — drawn once into an equirectangular canvas, which is the
 * projection a sphere's texture coordinates unwrap to.
 *
 * Land is drawn twice: once as a soft, slightly wider shape underneath in a
 * paler green, so the coasts have a shelf rather than a hard edge, and once
 * as the outline proper. A second, grey-scale canvas of the same land is the
 * bump map, which is what lets the coastlines catch the light as a lip.
 */
const W = 2048
const H = 1024

function outline(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  for (const country of COUNTRIES) {
    for (const ring of country.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        // Tenths of a degree, longitude then latitude.
        const x = ((ring[i] / 10 + 180) / 360) * W
        const y = ((90 - ring[i + 1] / 10) / 180) * H
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
  }
}

function paint(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const colour = document.createElement('canvas')
  colour.width = W
  colour.height = H
  const c = colour.getContext('2d')!

  // Ocean: a little lighter toward the equator, as the real one photographs.
  const sea = c.createLinearGradient(0, 0, 0, H)
  sea.addColorStop(0, '#2a5a80')
  sea.addColorStop(0.5, '#2f6a90')
  sea.addColorStop(1, '#2a5a80')
  c.fillStyle = sea
  c.fillRect(0, 0, W, H)

  // The shelf, then the land. Round joins so the stroke does not spike at
  // the sharp corners the coarse outlines have.
  c.lineJoin = 'round'
  outline(c)
  c.fillStyle = '#6f9d62'
  c.strokeStyle = '#6f9d62'
  c.lineWidth = 9
  c.stroke()
  c.fill()
  outline(c)
  c.fillStyle = '#4f8a52'
  c.fill()

  // Snow at the poles: Antarctica and the Greenland cap, by latitude.
  const ice = c.createLinearGradient(0, H * 0.86, 0, H)
  ice.addColorStop(0, 'rgba(236, 242, 246, 0)')
  ice.addColorStop(1, 'rgba(236, 242, 246, 1)')
  c.fillStyle = ice
  c.fillRect(0, H * 0.86, W, H * 0.14)
  const north = c.createLinearGradient(0, H * 0.1, 0, 0)
  north.addColorStop(0, 'rgba(236, 242, 246, 0)')
  north.addColorStop(1, 'rgba(236, 242, 246, 0.9)')
  c.fillStyle = north
  c.fillRect(0, 0, W, H * 0.1)

  const relief = document.createElement('canvas')
  relief.width = W
  relief.height = H
  const r = relief.getContext('2d')!
  r.fillStyle = '#000'
  r.fillRect(0, 0, W, H)
  r.lineJoin = 'round'
  outline(r)
  r.fillStyle = '#fff'
  r.fill()

  const map = new THREE.CanvasTexture(colour)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  const bump = new THREE.CanvasTexture(relief)
  bump.anisotropy = 8
  return { map, bump }
}

let cached: ReturnType<typeof paint> | null = null
/** Painted once, the first time the globe asks. */
export function globeTextures() {
  if (!cached) cached = paint()
  return cached
}
