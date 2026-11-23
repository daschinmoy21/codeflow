import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// CODEFLOW_GRAPHS: directory holding *.json graph files (default: ./graphs)
// CODEFLOW_OUT:    build output dir for the single-file HTML (default: ./dist)
const graphsDir = path.resolve(process.env.CODEFLOW_GRAPHS ?? path.join(import.meta.dirname, 'graphs'))
const outDir = path.resolve(process.env.CODEFLOW_OUT ?? path.join(import.meta.dirname, 'dist'))

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@graphs': graphsDir } },
  server: { port: Number(process.env.PORT ?? 5199), fs: { allow: [import.meta.dirname, graphsDir] } },
  build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4000 },
})
