import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/tm2020-tracker/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
})
