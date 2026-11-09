import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ plugins: [react()], base: '/sam/', build: { outDir: resolve(import.meta.dirname, '../../../public/sam'), emptyOutDir: true }, server: { proxy: { '/sam/colyseus': { target: 'http://localhost:3000', changeOrigin: true, ws: true } } } });

