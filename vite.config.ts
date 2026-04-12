import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'WanderTable',
          fileName: (format) => {
            if (format === 'umd') return 'wandertable.umd.js';
            if (format === 'iife') return 'wandertable.global.js';
            if (format === 'cjs') return 'wandertable.cjs';
            return 'wandertable.js';
          },
          formats: ['es', 'cjs', 'umd', 'iife'],
        },
        minify: 'esbuild',
        sourcemap: true,
        rollupOptions: {
          output: {
            assetFileNames: 'style[extname]',
          },
        },
      },
    };
  }

  // Dev mode: serve the demo page
  return {
    root: 'dev',
    resolve: {
      alias: {
        wandertable: resolve(__dirname, 'src/index.ts'),
      },
    },
  };
});
