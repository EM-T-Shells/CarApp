import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Desktop ops panel. Type-only imports of the CarApp generated Supabase types
// are erased at build, so no runtime alias is needed — the alias below only
// helps the editor/tsc resolve "@carapp-types".
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@carapp-types': new URL('../carApp/src/types/supabase.ts', import.meta.url).pathname,
    },
  },
  server: { port: 5173 },
});
