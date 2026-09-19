/**
 * What the scene knows about its own health, for the ?debug overlay.
 *
 * A plain mutable object, written from inside the render loop and read by a
 * DOM component on a slow timer. Not React state on purpose: several of these
 * change every frame, and the overlay is a diagnostic that must never itself
 * become a cost worth diagnosing. Reading it four times a second is the whole
 * of its overhead.
 *
 * The point of this object is the report it enables. Every attempt so far to
 * fix a black flash has been made without seeing the machine it happens on;
 * one screenshot of the overlay carries the GPU, the browser, the frame time,
 * which quality tier the governor settled at, and whether the WebGL context
 * has been lost — which is the difference between a fix and a guess.
 */
export const telemetry = {
  /** Smoothed frame time from the quality governor, in ms. */
  frameMs: 0,
  /** Quality tier the governor is at: 0 full, 1 vertex cuts, 2 fill cuts. */
  tier: 0,
  dpr: 1,
  /** Drawing-buffer size in device pixels. */
  width: 0,
  height: 0,
  /** Previous frame's counts from the renderer. */
  triangles: 0,
  drawCalls: 0,
  /**
   * Times the browser has taken the WebGL context away. A context loss is a
   * black canvas until it is restored, and on some drivers it happens under
   * load — it is the one cause of a black flash that no change to this code
   * can prevent, only make less likely by drawing less. Counted so a report
   * can say whether that is what is being seen.
   */
  contextLosses: 0,
  contextRestores: 0,
  lastLossAt: 0,
  /** The GPU, as the driver names it. */
  renderer: '',
}
