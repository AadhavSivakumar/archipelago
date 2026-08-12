import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = { failed: boolean }

/**
 * Guards the canvas, and only the canvas.
 *
 * The panel is deliberately mounted outside this boundary: a failure in the
 * scene — a blocklisted GPU, a `WebGLRenderer` that will not construct, a
 * landmark that throws while rendering — should cost the visitor the island,
 * not the six district names and blurbs, which are the page's actual content.
 * Wrapping the whole tree instead would trade a broken canvas for a blank page.
 *
 * Know the limit: boundaries see the render and commit phases only. Anything
 * thrown inside a `useFrame` callback runs in the animation loop, outside
 * React, and will not arrive here — it surfaces as a console error and a frozen
 * scene. Guard those at the call site instead.
 *
 * Error boundaries have no hook equivalent; a class is the only way to get
 * `getDerivedStateFromError`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Scene failed to render:', error, info.componentStack)
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
