import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo at /archipelago/, so assets must be requested
  // from there rather than the domain root. Dev and preview stay at '/'.
  base: process.env.GITHUB_ACTIONS ? '/archipelago/' : '/',
})
