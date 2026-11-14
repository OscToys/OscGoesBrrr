import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, swcPlugin} from 'electron-vite';
import react from '@vitejs/plugin-react';
import typiaPlugin from './scripts/typiaPlugin.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    main: {
        plugins: [typiaPlugin(path.join(root, 'src/main/tsconfig.typia.json')), swcPlugin()],
        build: {
            lib: {
                entry: path.join(root, 'src/main/bootstrap.ts'),
                formats: ['es'],
                fileName: 'main',
            },
            rollupOptions: {
                external: ['bufferutil', 'native-reg', 'utf-8-validate'],
            },
        },
    },
    preload: {
        build: {
            lib: {
                entry: path.join(root, 'src/preload/index.ts'),
                formats: ['cjs'],
                fileName: 'preload',
            },
        },
    },
    renderer: {
        root: path.join(root, 'src/frontend'),
        plugins: [typiaPlugin(path.join(root, 'src/frontend/tsconfig.typia.json')), react()],
        build: {
            rollupOptions: {
                input: path.join(root, 'src/frontend/index.html'),
            },
        },
    },
});
