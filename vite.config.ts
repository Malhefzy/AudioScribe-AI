import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // This securely maps the process.env.API_KEY used in the code 
      // to the actual environment variable loaded from the .env file.
      // This ensures the key is not hardcoded in the bundle but injected at build/runtime locally.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});