import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {createServer} from 'vite';
import typiaPlugin from './typiaPlugin.js';

test('validation stays active, cached, and updates after a type-only edit', async () => {
    await mkdir('.ttsc', {recursive: true});
    const directory = await mkdtemp(path.resolve('.ttsc/typia-test-'));
    let server;
    try {
        await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                target: 'ES2024',
                module: 'ESNext',
                moduleResolution: 'Bundler',
                plugins: [{transform: 'typia/lib/transform'}],
            },
            include: ['*.ts'],
        }));
        const types = path.join(directory, 'types.ts');
        const entry = path.join(directory, 'validation.ts');
        await writeFile(types, 'export interface Value { value: number }');
        await writeFile(entry, `import typia from 'typia';
import type {Value} from './types';
export const validate = (input: unknown) => typia.assert<Value>(input);`);
        server = await createServer({
            configFile: false,
            root: directory,
            server: {middlewareMode: true, hmr: false},
            optimizeDeps: {noDiscovery: true},
            plugins: [typiaPlugin(path.join(directory, 'tsconfig.json'), directory)],
        });
        const first = await server.ssrLoadModule(entry);
        assert.deepEqual(first.validate({value: 1}), {value: 1});
        assert.throws(() => first.validate({value: 'wrong'}));
        server.moduleGraph.invalidateAll();
        const cached = await server.ssrLoadModule(entry);
        assert.throws(() => cached.validate({value: 'still wrong'}));
        // Exercise the real watch event, including invalidation of type consumers.
        const changed = new Promise(resolve => {
            const listener = file => {
                if (path.resolve(file) !== types) return;
                server.watcher.off('change', listener);
                resolve();
            };
            server.watcher.on('change', listener);
        });
        await writeFile(types, 'export interface Value { value: string }');
        await changed;
        const updated = await server.ssrLoadModule(entry);
        assert.deepEqual(updated.validate({value: 'valid'}), {value: 'valid'});
        assert.throws(() => updated.validate({value: 1}));
    } finally {
        await server?.close();
        await rm(directory, {recursive: true, force: true});
    }
});
