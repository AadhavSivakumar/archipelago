import { buildGridArrays, buildPatchArrays, sampleHeight, shadeTerrain, type Palette } from './terrainField'

/**
 * Builds the terrain off the main thread.
 *
 * The whole point is what this file does NOT import. terrainField.ts is plain
 * arithmetic with no three dependency, so this worker's chunk is a few KB
 * rather than a second copy of the renderer.
 *
 * The four arrays are transferred, not cloned — ownership moves to the page and
 * the copy here becomes detached, which is what keeps a ~13MB handover from
 * costing another memcpy on both sides.
 */
export type TerrainRequest =
  | { kind: 'grid'; segX: number; segZ: number; palette: Palette }
  /** A dense square under one district — see buildPatchArrays. */
  | { kind: 'patch'; cx: number; cz: number; half: number; seg: number; blend: number; palette: Palette }
  /** Ground height on a regular grid, one byte a sample, for the sea's shading. */
  | { kind: 'heights'; minX: number; minZ: number; sizeX: number; sizeZ: number; w: number; h: number }

export type TerrainResponse = {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint32Array
}

self.onmessage = (event: MessageEvent<TerrainRequest>) => {
  const request = event.data
  const post = self.postMessage as (message: unknown, transfer: Transferable[]) => void

  if (request.kind === 'heights') {
    const { minX, minZ, sizeX, sizeZ, w, h } = request
    const data = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) {
      const z = minZ + ((j + 0.5) / h) * sizeZ
      for (let i = 0; i < w; i++) {
        const x = minX + ((i + 0.5) / w) * sizeX
        // -12..+4 units into a byte: fine enough near the waterline, where
        // the shading changes, and clamped where it does not.
        const v = (sampleHeight(x, z) + 12) / 16
        data[j * w + i] = Math.max(0, Math.min(255, Math.round(v * 255)))
      }
    }
    post({ heights: data }, [data.buffer])
    return
  }

  const { positions, index } =
    request.kind === 'patch'
      ? buildPatchArrays(request.cx, request.cz, request.half, request.seg, request.blend)
      : buildGridArrays(request.segX, request.segZ)
  const { normals, colors } = shadeTerrain(positions, index, request.palette)

  const payload: TerrainResponse = { positions, normals, colors, index }

  // `self` types as a Window here — the project's lib list has DOM but not
  // WebWorker — and Window.postMessage has a different second parameter. This
  // narrows to the worker overload rather than casting the argument into a
  // shape it is not.
  post(payload, [positions.buffer, normals.buffer, colors.buffer, index.buffer])
}
