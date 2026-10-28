import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/tm2020-tracker/',
  plugins: [react()],
  worker: { format: 'es' },
})
