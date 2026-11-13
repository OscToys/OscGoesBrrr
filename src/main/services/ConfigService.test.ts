import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs, {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import ttsc from '@ttsc/unplugin/vite';
import type * as Configuration from '../../common/application/configuration';
import {getDefaultLinks} from '../../plugins/vrchat/shared/config';
import type ConfigService from './ConfigService';
import type {IntifaceOutputConfig} from '../../plugins/intiface/shared/config';

test('a fresh config loads, persists, accepts edits, and resets through the real ConfigService', {timeout: 180000}, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ogb-fresh-config-'));
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
    const {getDefaultConfig} = await server.ssrLoadModule('/src/common/application/configuration.ts') as typeof Configuration;
    const {handlers} = await server.ssrLoadModule('electron');
    const messages: unknown[] = [];
    store = new ConfigServiceClass(
        {send: (...args: unknown[]) => { messages.push(args); return true; }},
    ) as ConfigService;

    assert.deepEqual(await store.get(), getDefaultConfig());
    assert.equal(store.getLoadError(), undefined);
    const filename = path.join(directory, 'config.json');
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), getDefaultConfig());
    await assert.rejects(readFile(path.join(directory, 'config.bak.1.json')), {code: 'ENOENT'});
    await assert.rejects(readFile(path.join(directory, 'config.bak.2.json')), {code: 'ENOENT'});
    await store.mutate(draft => { draft.plugins['vrchat']!['maxLevelParam'] = 'Test'; });
    assert.equal(store.getCached().plugins['vrchat']!['maxLevelParam'], 'Test');
    await store.mutate(draft => {
        draft.outputs.push({
            plugin: 'intiface',
            id: 'test',
            enabled: false,
            links: [{plugin: 'constant', kind: 'constant', level: 0.5, enabled: false}],
        });
    });
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(saved.outputs[0].enabled, false);
    assert.equal(saved.outputs[0].links[0].enabled, false);
    const zone = getDefaultLinks()[1]!;
    if (zone.kind !== 'vrchat.sps.socket') throw new Error('Expected socket link');
    await handlers.get('config:set')({}, {
        ...store.getCached(),
        outputs: [{
            plugin: 'intiface',
            id: 'modes',
            links: [{
                ...zone,
                plugs: {...zone.plugs, mode: 'movement', self: true, others: false},
                hands: {...zone.hands, mode: 'proximity'},
            }],
        }],
    });
    const modes = JSON.parse(await readFile(filename, 'utf8')).outputs[0].links[0];
    assert.deepEqual(modes.plugs, {mode: 'movement', self: true, others: false});
    assert.deepEqual(modes.hands, {mode: 'proximity', self: false, others: true});
    for (const invalid of [true, 'unknown']) {
        await assert.rejects(() => handlers.get('config:set')({}, {
            ...store!.getCached(),
            outputs: [{plugin: 'intiface', id: 'invalid', links: [{...zone, hands: {...zone.hands, mode: invalid}}]}],
        }));
    }
    assert.equal(store.getCached().outputs[0]!.id, 'modes');
    const unknownLink = {
        plugin: 'uninstalled',
        kind: 'constant',
        level: 'opaque data owned by a different plugin',
        enabled: false,
        amount: 0.4,
        options: {nested: ['keep', 42, true]},
        mutators: [{kind: 'future-modifier', amount: 2}],
    };
    const unhandledLink = {plugin: 'vrchat', kind: 'vrchat.future', mutators: {private: ['opaque', 42]}};
    const unknownOutput = {plugin: 'uninstalled', id: 'modes', links: [unknownLink, unhandledLink], pluginOptions: {keep: true}};
    const unknownSettings = {version: 27, private: {keep: ['opaque', 42]}};
    await handlers.get('config:set')({}, {
        ...store!.getCached(),
        plugins: {...store!.getCached().plugins, uninstalled: unknownSettings},
        outputs: [...store!.getCached().outputs, unknownOutput],
    });
    await store.mutate(draft => { draft.plugins['vrchat']!['maxLevelParam'] = 'Preserve unknown settings'; });
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')).outputs[1], unknownOutput);
    await store.dispose();
    store = new ConfigServiceClass(
        {send: () => true},
    ) as ConfigService;
    assert.deepEqual((await store.get()).outputs[1], unknownOutput);
    assert.deepEqual(store.getCached().plugins['uninstalled'], unknownSettings);
    assert.equal(store.getLoadError(), undefined);
    for (const invalid of [
        {amount: 0.4},
        {kind: 42},
        {kind: 'future.link', enabled: 'yes'},
        {plugin: 'constant', kind: 'constant'},
        {plugin: 'constant', kind: 'constant', level: 'not a number'},
        {plugin: 'audio', kind: 'systemAudio', mutators: [{kind: 'deadZone', level: 0.2}]},
        {...zone, mutators: [{kind: 'future-modifier', amount: 2}]},
        {plugin: 'vrchat', kind: 'vrchat.avatarParameter', parameter: 42, mutators: []},
    ]) {
        await assert.rejects(() => handlers.get('config:set')({}, {
            ...store!.getCached(),
            outputs: [{plugin: 'intiface', id: 'invalid', links: [invalid]}],
        }));
    }
    const incomplete = structuredClone(store.getCached());
    delete incomplete.plugins['vrchat']!['useOscQuery'];
    await assert.rejects(() => handlers.get('config:set')({}, incomplete));
    for (const version of [0, 1.5, 2]) {
        await assert.rejects(() => handlers.get('config:set')({}, {
            ...store!.getCached(),
            plugins: {...store!.getCached().plugins, audio: {version}},
        }), /config version/);
    }
    await assert.rejects(() => handlers.get('config:set')({}, {...store!.getCached(), version: 4}), /config version/);
    assert.equal(store.getCached().outputs[0]!.id, 'modes');
    await handlers.get('config:reset')({});
    assert.equal(store.getLoadError(), undefined);
    assert.deepEqual(await store.get(), getDefaultConfig());
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), getDefaultConfig());
    assert.ok(messages.length > 0);
    await store.dispose();
    await writeFile(filename, JSON.stringify({
        version: 4,
        useOscQuery: true,
        useIntifaceMdns: false,
        oscProxy: [],
        outputs: [{
            id: 'intiface.1.0',
            links: [
                {kind: 'constant', level: 0.2},
                {kind: 'systemAudio', mutators: []},
                {kind: 'vrchat.avatarParameter', parameter: 'Test', mutators: [{kind: 'motionBased'}]},
                {
                    kind: 'vrchat.sps.plug',
                    filter: {include: [], exclude: []},
                    ownHands: false,
                    otherHands: true,
                    mySockets: false,
                    otherSockets: true,
                    otherPlugs: true,
                    mutators: [],
                },
            ],
        }],
    }));
    store = new ConfigServiceClass(
        {send: () => true},
    ) as ConfigService;
    const upgraded = await store.get();
    assert.equal(store.getLoadError(), undefined);
    assert.equal(upgraded.outputs[0]!.plugin, 'intiface');
    assert.deepEqual((upgraded.outputs[0]! as IntifaceOutputConfig).links.map(link => link.plugin), ['constant', 'audio', 'vrchat', 'vrchat']);
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), upgraded);
    await writeFile(path.join(directory, 'config.txt'), 'audio=2\nall.key=Custom\nall.idle=0.25\n');
    await handlers.get('config:reset')({});
    assert.deepEqual(await store.get(), getDefaultConfig(), 'reset ignores the removed TXT format');
    await store.dispose();
    await rm(filename);
    store = new ConfigServiceClass({send: () => true}) as ConfigService;
    assert.deepEqual(await store.get(), getDefaultConfig(), 'fresh startup also ignores TXT');
    assert.equal(store.getLoadError(), undefined);

    const invalid = {...getDefaultConfig(), extraRootSetting: true};
    await assert.rejects(() => handlers.get('config:set')({}, invalid), /top-level/);
    await store.dispose();
    await writeFile(filename, JSON.stringify(invalid));
    store = new ConfigServiceClass({send: () => true}) as ConfigService;
    await store.get();
    assert.match(store.getLoadError()!, /top-level/);
    await assert.rejects(() => store!.mutate(getDefaultConfig()), /top-level/);
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), invalid, 'invalid config must not be silently rewritten');

    await t.test('version-changing saves preserve and rotate config backups', async t => {
        const backup = path.join(directory, 'config.bak.1.json');
        const olderBackup = path.join(directory, 'config.bak.2.json');
        const legacyText = JSON.stringify(
            {
                version: 4,
                useOscQuery: true,
                useIntifaceMdns: false,
                oscProxy: [],
                outputs: [],
            },
            null,
            4,
        ) + '\n';
        const load = async (text: string) => {
            await store!.dispose();
            await writeFile(filename, text);
            store = new ConfigServiceClass({send: () => true}) as ConfigService;
            return await store.get();
        };
        const readBackups = async () => [
            await readFile(backup, 'utf8'),
            await readFile(olderBackup, 'utf8'),
        ];

        await writeFile(backup, 'previous backup\n');
        await writeFile(olderBackup, 'oldest backup to overwrite\n');
        await t.test('core upgrades copy the exact old file and rotate backup 1 over backup 2', async () => {
            const upgraded = await load(legacyText);
            assert.equal(store!.getLoadError(), undefined);
            assert.equal(upgraded.version, getDefaultConfig().version);
            assert.deepEqual(await readBackups(), [legacyText, 'previous backup\n']);
        });

        let pluginText: string;
        await t.test('plugin-only upgrades rotate once even when multiple plugin versions change', async () => {
            const {registerPluginConfiguration} = await server.ssrLoadModule('/src/common/application/pluginConfiguration.ts') as
                typeof import('../../common/application/pluginConfiguration');
            const unregister = ['example-one', 'example-two'].map(id => registerPluginConfiguration({
                id,
                defaults: {version: 2},
                upgrade(settings) { settings['upgraded'] = true; },
            }));
            try {
                const old = getDefaultConfig();
                old.plugins['example-one'] = {version: 1};
                old.plugins['example-two'] = {version: 1};
                pluginText = JSON.stringify(old, null, 3) + '\n';
                const upgraded = await load(pluginText);
                assert.equal(store!.getLoadError(), undefined);
                assert.equal(upgraded.version, old.version);
                assert.deepEqual(upgraded.plugins['example-one'], {version: 2, upgraded: true});
                assert.deepEqual(upgraded.plugins['example-two'], {version: 2, upgraded: true});
                assert.deepEqual(await readBackups(), [pluginText, legacyText]);
            } finally {
                for (const remove of unregister) remove();
            }
        });

        await t.test('normalization, ordinary saves and current-version reloads do not rotate backups', async () => {
            const old = getDefaultConfig();
            old.plugins['intiface']!['intifaceAddress'] = '127.0.0.1:12345';
            const loaded = await load(JSON.stringify(old));
            assert.equal(store!.getLoadError(), undefined);
            assert.equal(loaded.plugins['intiface']!['intifaceAddress'], undefined);
            await store!.mutate(draft => { draft.plugins['vrchat']!['maxLevelParam'] = 'Normal save'; });
            await store!.mutate(draft => { draft.plugins = Object.fromEntries(Object.entries(draft.plugins).reverse()); });
            await load(await readFile(filename, 'utf8'));
            assert.equal(store!.getLoadError(), undefined);
            assert.deepEqual(await readBackups(), [pluginText!, legacyText]);
        });

        await t.test('invalid upgraded configs leave the original file and both backups untouched', async () => {
            const invalidText = legacyText.replace('"useOscQuery": true', '"useOscQuery": "invalid"');
            await load(invalidText);
            assert.ok(store!.getLoadError());
            await assert.rejects(() => store!.mutate(getDefaultConfig()));
            assert.equal(await readFile(filename, 'utf8'), invalidText);
            assert.deepEqual(await readBackups(), [pluginText!, legacyText]);
        });

        await t.test('fresh creation and reset preserve existing backups', async () => {
            await store!.dispose();
            await rm(filename);
            store = new ConfigServiceClass({send: () => true}) as ConfigService;
            assert.deepEqual(await store.get(), getDefaultConfig());
            await handlers.get('config:reset')({});
            assert.deepEqual(await store.get(), getDefaultConfig());
            assert.deepEqual(await readBackups(), [pluginText!, legacyText]);
        });

        await t.test('backup rotation errors block the upgrade instead of overwriting the config', async () => {
            await rm(olderBackup);
            await mkdir(olderBackup);
            await load(legacyText);
            assert.ok(store!.getLoadError());
            await assert.rejects(() => store!.mutate(getDefaultConfig()));
            assert.equal(await readFile(filename, 'utf8'), legacyText);
            assert.equal(await readFile(backup, 'utf8'), pluginText!);
        });

        await t.test('backup copy errors block the upgrade and retain backup 1 as backup 2', async t => {
            await rm(olderBackup, {recursive: true});
            const copyFile = fs.copyFile;
            t.mock.method(fs, 'copyFile', async (...args: Parameters<typeof fs.copyFile>) => {
                if (args[0] === filename && args[1] === backup) throw new Error('Backup copy failed');
                return await copyFile(...args);
            });
            await load(legacyText);
            assert.match(store!.getLoadError()!, /Backup copy failed/);
            await assert.rejects(() => store!.mutate(getDefaultConfig()), /Backup copy failed/);
            assert.equal(await readFile(filename, 'utf8'), legacyText);
            assert.equal(await readFile(olderBackup, 'utf8'), pluginText!);
            await assert.rejects(readFile(backup), {code: 'ENOENT'});
        });
    });
});
