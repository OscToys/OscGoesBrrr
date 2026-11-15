import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import files from 'node:fs/promises';
import {mkdtemp, mkdir, rename, rm, writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createServer} from 'vite';
import typiaPlugin from '../../../scripts/typiaPlugin.js';

test('JSON state watches nonrecursively and follows edits, replacements and recreation', {timeout: 30000}, async t => {
    // Load the real typia-backed error helper through the production transform.
    const server = await createServer({
        configFile: false,
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
        plugins: [typiaPlugin(path.resolve('src/main/tsconfig.typia.json'))],
    });
    t.after(() => server.close());
    const {default: AbstractJsonStateService} = await server.ssrLoadModule(
        '/src/main/services/AbstractJsonStateService.ts',
    ) as typeof import('./AbstractJsonStateService');
    class State extends AbstractJsonStateService<{value: number}> {
        constructor(filename: string) {
            super(filename, {value: 0}, raw => {
                assert.equal(typeof (raw as {value: unknown}).value, 'number');
                return raw as {value: number};
            });
        }
    }

    const directory = await mkdtemp(path.join(tmpdir(), 'ogb-state-watch-'));
    const filename = path.join(directory, 'config.json');
    await writeFile(filename, '{"value":1}');
    await mkdir(path.join(directory, 'build'));
    await writeFile(path.join(directory, 'build', 'unrelated.json'), '{}');
    const watches: {filename: string; recursive: unknown}[] = [];
    const originalWatch = nativeFs.watch;
    t.mock.method(nativeFs, 'watch', (...args: Parameters<typeof nativeFs.watch>) => {
        const options: unknown = args[1];
        watches.push({
            filename: String(args[0]),
            recursive: typeof options === 'object' && options !== null && 'recursive' in options ? options.recursive : undefined,
        });
        return Reflect.apply(originalWatch, nativeFs, args);
    });
    t.mock.method(nativeFs, 'watchFile', () => {
        throw new Error('JSON state must not poll');
    });
    syncBuiltinESMExports();
    const state = new State(filename);
    t.after(async () => {
        await state.dispose();
        t.mock.restoreAll();
        syncBuiltinESMExports();
        await rm(directory, {recursive: true, force: true});
    });
    assert.deepEqual(await state.get(), {value: 1});
    await state.startExternalWatch();
    assert.deepEqual(watches, [{filename: directory, recursive: false}]);
    let configReads = 0;
    const originalReadFile = files.readFile;
    t.mock.method(files, 'readFile', (...args: Parameters<typeof files.readFile>) => {
        if (String(args[0]) === filename) configReads++;
        return Reflect.apply(originalReadFile, files, args);
    });
    await writeFile(path.join(directory, 'unrelated.json'), '{}');
    await writeFile(path.join(directory, 'build', 'unrelated.json'), '{"changed":true}');
    await new Promise(resolve => setTimeout(resolve, 450));
    assert.equal(configReads, 0, 'Unrelated files must not trigger config reads');
    const updated = (value: number) => new Promise<void>(resolve => {
        const listener = (data: {value: number}) => {
            if (data.value !== value) return;
            state.off('changed', listener);
            resolve();
        };
        state.on('changed', listener);
    });
    const edited = updated(2);
    await writeFile(filename, '{"value":2}');
    await edited;
    const replaced = updated(3);
    const temporary = path.join(directory, 'replacement.json');
    await writeFile(temporary, '{"value":3}');
    await rename(temporary, filename);
    await replaced;
    const deleted = updated(0);
    await rm(filename);
    await deleted;
    const recreated = updated(4);
    await writeFile(filename, '{"value":4}');
    await recreated;
    assert.deepEqual(watches, [{filename: directory, recursive: false}]);
});
