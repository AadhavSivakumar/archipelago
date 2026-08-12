import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
  GitHub Pages serves a project site from /<repo>/, so assets must be requested
  from there rather than the domain root.

  The repo segment is derived from GITHUB_REPOSITORY rather than hardcoded. The
  previous version keyed off the mere presence of GITHUB_ACTIONS and always
  emitted '/archipelago/', which 404s every asset on a fork or after a rename —
  and stays silent until the first runtime fetch, since a hardcoded base still
  builds cleanly.
*/
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')

// A user or org site (owner.github.io) is served from the domain root;
// everything else is a project site one segment down.
const isUserSite = repo?.toLowerCase() === `${owner?.toLowerCase()}.github.io`
const pagesBase = repo && !isUserSite ? `/${repo}/` : '/'

export default defineConfig({
  plugins: [react()],

  // Overridable with `vite build --base=…`, which is how `npm run preview:pages`
  // exercises the deployed layout locally. Neither `build` nor `preview` ever
  // touched the deploy base before.
  base: pagesBase,

  /*
    TODO: split three (~600kB minified) into its own chunk so it downloads
    alongside the app shell and stays cached across app deploys. Today every
    build ships one undifferentiated bundle and trips the 500kB chunk warning.

    Deliberately not done blind. Vite 8 bundles with Rolldown, not Rollup —
    there is no rollup package anywhere in the lockfile, and `rolldown` is a
    direct dependency of `vite@8.2.1`. So the familiar
    `build.rollupOptions.output.manualChunks` object form targets the wrong
    bundler: Rolldown's native API is `output.advancedChunks.groups`, and what
    its Rollup-compat layer accepts here needs an actual build to confirm.
    Guessing wrong either fails `tsc --noEmit` on excess-property checking or
    fails `vite build` — and this file is on the deploy path.

    Add it behind a real `npm run build`, not from reading alone.
  */
})
