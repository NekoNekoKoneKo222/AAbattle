import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({plugins:[react()],base:'/GF/',build:{outDir:resolve(import.meta.dirname,'../../public/GF'),emptyOutDir:true}});
