import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]/,
              minSize: 20_000,
              maxSize: 450_000,
              priority: 30,
            },
            {
              name: 'react-three',
              test: /node_modules[\\/]@react-three[\\/]/,
              minSize: 20_000,
              maxSize: 450_000,
              priority: 20,
            },
          ],
        },
      },
    },
  },
})
