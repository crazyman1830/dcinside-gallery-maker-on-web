import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const cwd = process.cwd();

  return {
    plugins: [react()],
    server: {
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key,p12,pfx}',
          '**/.git/**',
          '**/vertex/**',
          '**/credentials/**',
          '**/secrets/**',
          '**/*service-account*.json',
          '**/*service_account*.json',
        ],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(cwd),
      },
    },
    base: './',
  };
});
