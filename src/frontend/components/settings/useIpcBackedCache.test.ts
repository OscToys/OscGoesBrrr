/// <reference types="node" />
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';

test('the renderer rejects invalid IPC results without losing its last good state', async t => {
    const server = await createServer({
        configFile: false,
        appType: 'custom',
        server: {middlewareMode: true, hmr: false},
        optimizeDeps: {noDiscovery: true},
        ssr: {noExternal: ['react', 'jotai']},
        plugins: [{
            name: 'test-ipc-cache-host',
            enforce: 'pre',
            resolveId(id) {
                if (id === 'react' || id === 'jotai') return '\0cache-test:' + id;
                if (id === '../../ipc' || id === 'test-cache-ipc') return '\0cache-test:ipc';
                return undefined;
            },
            load(id) {
                if (id === '\0cache-test:react') return `
                    export const effects = [];
                    export const state = [];
                    export const useCallback = fn => fn;
                    export const useRef = current => ({current});
                    export const useEffect = effect => effects.push(effect);
                    export const useState = initial => {
                        const index = state.push(initial) - 1;
                        return [initial, next => { state[index] = next; }];
                    };
                `;
                if (id === '\0cache-test:jotai') return `
                    import {createStore} from 'jotai/vanilla';
                    export {atom} from 'jotai/vanilla';
                    export const store = createStore();
                    export const useStore = () => store;
                `;
                if (id === '\0cache-test:ipc') return `
                    export const listeners = new Map();
                    export const requests = [];
                    export const invokeIpc = async channel => { requests.push(channel); };
                    export const onIpc = (channel, listener) => {
                        listeners.set(channel, listener);
                        return () => listeners.delete(channel);
                    };
                `;
                return undefined;
            },
        }],
    });
    t.after(() => server.close());
    const {default: useIpcBackedCache} = await server.ssrLoadModule('/src/frontend/components/settings/useIpcBackedCache.ts');
    const {effects, state} = await server.ssrLoadModule('react');
    const {store} = await server.ssrLoadModule('jotai');
    const ipc = await server.ssrLoadModule('test-cache-ipc');
    const cache = useIpcBackedCache({
        changeEvent: 'config:changed',
        requestInvoke: 'config:request',
        parseResult: (raw: any) => {
            if (raw.ok && typeof raw.data.version !== 'number') throw new Error('Invalid config version');
            return raw;
        },
    });
    const dispose = effects[0]();
    assert.deepEqual(ipc['requests'], ['config:request']);
    const receive = ipc['listeners'].get('config:changed');
    const config = {version: 5, outputs: [], plugins: {future: {version: 1, opaque: true}}};
    receive({ok: true, data: config});
    assert.deepEqual(store.get(cache.dataAtom), config);
    receive({ok: true, data: {...config, version: 'invalid'}});
    assert.equal(state[0], 'Invalid config version');
    assert.deepEqual(store.get(cache.dataAtom), config);
    receive({ok: false, error: 'Config validation failed'});
    assert.equal(state[0], 'Config validation failed');
    assert.deepEqual(store.get(cache.dataAtom), config);
    receive({ok: true, data: config});
    assert.equal(state[0], undefined);
    dispose();
    assert.equal(ipc['listeners'].size, 0);
    const {default: configFile} = await server.ssrLoadModule('/electron.vite.config.js');
    assert.ok(configFile.main.plugins.some((plugin: {name: string}) => plugin.name === 'typia-project'));
    assert.ok(configFile.renderer.plugins.flat().some((plugin: {name: string}) => plugin.name === 'typia-project'));
});
