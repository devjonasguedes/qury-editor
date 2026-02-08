import { defineConfig } from 'electron-vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main.js')
        }
      }
    }
  },
  preload: {
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload.js')
        }
      }
    }
  },
  renderer: {
    root: '.',
    base: './',
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    }
  }
});
