import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = __dirname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const port = Number(env.VITE_CUSTOMER_PORT) || 3005;
  const devProxyTarget = process.env.VITE_DEV_API_PROXY || env.VITE_DEV_API_PROXY || 'http://localhost:4000';

  return {
    root: path.resolve(projectRoot, 'customer'),
    server: {
      port,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: path.resolve(projectRoot, 'dist/customer'),
      emptyOutDir: false
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.')
      }
    }
  };
});
