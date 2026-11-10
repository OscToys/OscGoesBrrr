import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import ttsc from '@ttsc/unplugin/vite';
import {getDefaultConfig} from '../../common/plugins/configuration';
import type ConfigService from './ConfigService';
import type LegacyTxtConfigImportService from '../plugins/LegacyTxtConfigImportService';

test('a fresh config loads, persists, accepts edits, and resets through the real ConfigService', {timeout: 30000}, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ogb-fresh-config-'));
    const server = await createServer({
        configFile: false,
        appType: 'custom',
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
        ssr: {noExternal: ['electron']},
        plugins: [
            {
                name: 'test-electron-host',
                enforce: 'pre',
                resolveId(id) { return id === 'electron' ? '\0test-electron' : undefined; },
                load(id) {
                    if (id !== '\0test-electron') return;
                    return `
                        export const handlers = new Map();
                        export const app = {getPath: () => ${JSON.stringify(directory)}};
                        export const shell = {openPath: async () => ''};
                        export const ipcMain = {
                            handle: (channel, handler) => handlers.set(channel, handler),
                            removeHandler: channel => handlers.delete(channel),
                        };
                    `;
                },
            },
            ttsc({project: path.resolve('src/tsconfig.typia.json')}),
        ],
    });
    let store: ConfigService | undefined;
    t.after(async () => {
        await store?.dispose();
        await server.close();
        await rm(directory, {recursive: true, force: true});
    });
    // Load with the real typia transform, rather than mocking validation or the errno guard.
    const {default: ConfigServiceClass} = await server.ssrLoadModule('/src/main/services/ConfigService.ts');
    const {default: LegacyImportClass} = await server.ssrLoadModule('/src/main/plugins/LegacyTxtConfigImportService.ts');
    const {handlers} = await server.ssrLoadModule('electron');
    const messages: unknown[] = [];
    store = new ConfigServiceClass(
        new LegacyImportClass() as LegacyTxtConfigImportService,
        {send: (...args: unknown[]) => { messages.push(args); return true; }},
    ) as ConfigService;

    assert.deepEqual(await store.get(), getDefaultConfig());
    assert.equal(store.getLoadError(), undefined);
    const filename = path.join(directory, 'config.json');
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), getDefaultConfig());
    await store.mutate(draft => { draft.maxLevelParam = 'Test'; });
    assert.equal(store.getCached().maxLevelParam, 'Test');
    await handlers.get('config:reset')({});
    assert.equal(store.getLoadError(), undefined);
    assert.deepEqual(await store.get(), getDefaultConfig());
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), getDefaultConfig());
    assert.ok(messages.length > 0);
});
