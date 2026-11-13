import 'reflect-metadata';
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {createServer} from 'vite';
import ttsc from '@ttsc/unplugin/vite';

test('Linux discovery checks the actual Flatpak Steam directory', async t => {
    const directory = path.resolve('test-home');
    const server = await createServer({
        configFile: false,
        appType: 'custom',
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
        ssr: {noExternal: ['electron']},
        oxc: {decorator: {legacy: true, emitDecoratorMetadata: true}},
        plugins: [
            {
                name: 'test-electron-host',
                enforce: 'pre',
                resolveId(id) { return id === 'electron' ? '\0test-electron' : undefined; },
                load(id) {
                    if (id !== '\0test-electron') return;
                    return `export const app = {getPath: () => ${JSON.stringify(directory)}};`;
                },
            },
            ttsc({project: path.resolve('src/tsconfig.typia.json')}),
        ],
    });
    t.after(() => server.close());
    const {default: VrchatLogFinder} = await server.ssrLoadModule('/src/plugins/vrchat/main/VrchatLogFinder.ts');
    const {getDefaultConfig} = await server.ssrLoadModule('/src/common/application/configuration.ts');
    const finder = new VrchatLogFinder({get: () => ({log() {}})}, {get: async () => getDefaultConfig()});
    const expectedRoot = path.resolve(directory, '.var/app/com.valvesoftware.Steam/.local/share/Steam');
    const roots: string[] = [];
    finder.trySteamRoot = async (root: string, prefix: string) => {
        roots.push(root);
        return root === expectedRoot ? [path.resolve(root, prefix)] : [];
    };
    // Exercise the Linux branch even when the test runner is on Windows.
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', {value: 'linux'});
    try {
        const found = await finder.getDetectedVrcConfigDir();
        assert.equal(roots[0], expectedRoot);
        assert.equal(found.length, 1);
        assert.ok(found[0].startsWith(expectedRoot + path.sep));
    } finally {
        Object.defineProperty(process, 'platform', platform);
    }
});
