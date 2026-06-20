import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        sidepanel: 'sidepanel.html',
        background: 'src/background.ts',
        content: 'src/content/content.ts'
      },
      output: {
        entryFileNames: (chunkInfo) =>
          ['background', 'content'].includes(chunkInfo.name)
            ? '[name].js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'content.css'
            ? 'content.css'
            : 'assets/[name]-[hash][extname]'
      }
    }
  }
});
