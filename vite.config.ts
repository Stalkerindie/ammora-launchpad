import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://stalkerindie.github.io/ammora-launchpad/
export default defineConfig({
  plugins: [react()],
  base: '/ammora-launchpad/',
})
