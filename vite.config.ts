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

  build: {
    /*
      three is ~600kB minified and only changes when the dependency does, so
      splitting it out lets the browser fetch it alongside the app shell and —
      more usefully — keeps it cached across app deploys, which are frequent
      while the scene is being tuned.

      `rolldownOptions`, not `rollupOptions`: Vite 8 bundles with Rolldown.
      There is no rollup package anywhere in the lockfile, and vite@8.2.1
      depends on rolldown directly, so the familiar
      `rollupOptions.output.manualChunks` targets a bundler that is not here —
      Vite keeps that name only as a deprecated compat alias. Rolldown's own
      option is `output.codeSplitting.groups`; `advancedChunks` is the older
      spelling and is ignored when both are set.
    */
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            /*
              The world's countries are 73kB of coordinate literals that change
              only when the map is re-baked from Natural Earth — which is to say
              essentially never, and certainly not on the same cadence as the
              scene they are drawn in. Left in the app chunk they were re-sent in
              full on every deploy, for about 23kB gzipped a time.
            */
            { name: 'worldmap', test: /src[\\/]scene[\\/]worldCountries\.ts$/ },
          ],
        },
      },
    },
  },
})
