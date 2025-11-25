
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Fix: Type cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error
    const CWD = (process as any).cwd();
    const env = loadEnv(mode, CWD, '');

    return {
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(CWD), // Alias '@' to the project root
        }
      },
      base: './',
    };
});
