import { buildGridArrays, buildPatchArrays, shadeTerrain, type Palette } from './terrainField'

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

export type TerrainResponse = {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint32Array
}

self.onmessage = (event: MessageEvent<TerrainRequest>) => {
  const request = event.data

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
  const post = self.postMessage as (message: unknown, transfer: Transferable[]) => void
  post(payload, [positions.buffer, normals.buffer, colors.buffer, index.buffer])
}
