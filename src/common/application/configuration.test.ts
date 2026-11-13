import assert from 'node:assert/strict';
import {test} from 'node:test';
import {freeze, produce} from 'immer';
import {CONFIG_VERSION, getDefaultConfig, getDefaultLinks, normalizePluginConfig, upgradeConfig} from './configuration';
import {getPluginConfigurations, registerPluginConfiguration} from './pluginConfiguration';
import type {Config} from './configTypes';

test('configuration discovers namespaced defaults, links and normalization without named integrations', () => {
    const defaults = {version: 1, exampleSetting: ['original']};
    const link = {plugin: 'example', kind: 'private-kind', enabled: true};
    const unregister = registerPluginConfiguration({
        id: 'example',
        defaults,
        defaultLinks: () => [link],
        normalize(draft, source) {
            draft['exampleSetting'] = [source];
        },
    });
    try {
        assert.throws(() => registerPluginConfiguration({id: 'example', defaults}), /duplicate/);
        const config = getDefaultConfig();
        assert.deepEqual(Object.keys(config).sort(), ['outputs', 'plugins', 'version']);
        assert.equal(config.version, CONFIG_VERSION);
        assert.deepEqual(config.outputs, []);
        assert.deepEqual(config.plugins['example'], defaults);
        assert.notEqual(config.plugins['example']!['exampleSetting'], defaults.exampleSetting);
        const links = getDefaultLinks();
        links[0]!.enabled = false;
        assert.equal(getDefaultLinks()[0]!.enabled, true);
        assert.equal(link.enabled, true);
        const normalized = produce(config, draft => normalizePluginConfig(draft, 'load'));
        assert.deepEqual(normalized.plugins['example']!['exampleSetting'], ['load']);
        const frozen = freeze(getDefaultConfig(), true);
        assert.equal(upgradeConfig(frozen), frozen);
        assert.throws(() => upgradeConfig({...config, version: CONFIG_VERSION + 1}), /Unsupported config version/);
    } finally {
        unregister();
    }
    assert.ok(!getPluginConfigurations().some(plugin => plugin.id === 'example'));
    assert.ok(!('example' in getDefaultConfig().plugins));
});

test('independent versions dispatch device and link upgrades to their owners', () => {
    const calls: string[] = [];
    const unregisterDevice = registerPluginConfiguration({
        id: 'device-owner',
        defaults: {version: 2},
        upgrade(settings) {
            assert.equal(settings.version, 1);
            calls.push('device');
        },
        upgradeOutput(output, version) {
            assert.equal(version, 1);
            output['deviceSetting'] = 'upgraded';
            return output;
        },
    });
    const unregisterSource = registerPluginConfiguration({
        id: 'source-owner',
        defaults: {version: 3},
        upgrade(settings) {
            assert.equal(settings.version, 2);
            calls.push('source');
        },
        upgradeLink(link, version) {
            assert.equal(version, 2);
            link['sourceSetting'] = 'upgraded';
            return link;
        },
    });
    const sourceLinks = [
        {plugin: 'source-owner', kind: 'private-kind', sourceSetting: 'old'},
        {plugin: 'uninstalled', kind: 'private-kind', sourceSetting: 'preserve'},
    ];
    try {
        const unknown = {
            plugin: 'uninstalled',
            id: 'same',
            privateData: {keep: true},
            links: [{plugin: 'source-owner', kind: 'private-kind', sourceSetting: 'old'}],
        };
        const config = {
            version: CONFIG_VERSION,
            outputs: [{plugin: 'device-owner', id: 'same', links: sourceLinks}, unknown],
            plugins: {'device-owner': {version: 1}, 'source-owner': {version: 2}, uninstalled: {version: 99, keep: true}},
        };
        const upgraded = upgradeConfig(config);
        assert.equal(upgraded, config);
        assert.equal(config.plugins['device-owner'].version, 2);
        assert.equal(config.plugins['source-owner'].version, 3);
        assert.deepEqual(config.plugins.uninstalled, {version: 99, keep: true});
        assert.equal(sourceLinks[0]!.sourceSetting, 'upgraded');
        assert.equal(sourceLinks[1]!.sourceSetting, 'preserve');
        assert.deepEqual(config.outputs[1], unknown);
        assert.equal(unknown.links[0]!.sourceSetting, 'upgraded', 'source upgrades work even without the device plugin');
        assert.deepEqual(unknown.privateData, {keep: true});
        assert.deepEqual(calls, ['device', 'source']);
        upgradeConfig(freeze(config, true));
        assert.deepEqual(calls, ['device', 'source']);
        assert.throws(() => upgradeConfig({
            ...getDefaultConfig(),
            plugins: {'device-owner': {version: 100}},
        }), /Unsupported device-owner config version/);
    } finally {
        unregisterDevice();
        unregisterSource();
    }
});

test('upgrade transforms persist replacements and removals, including links introduced by a later device plugin', () => {
    const calls: string[] = [];
    const unregisterSource = registerPluginConfiguration({
        id: 'a-source',
        defaults: {version: 2},
        upgradeLink(link, version) {
            assert.equal(version, 1);
            calls.push(link.kind);
            return link.kind === 'remove' ? null : {...link, kind: 'upgraded', previousKind: link.kind};
        },
    });
    const unregisterDevice = registerPluginConfiguration({
        id: 'z-device',
        defaults: {version: 2},
        upgradeOutput(output, version) {
            assert.equal(version, 1);
            return output.id === 'remove' ? null : {
                ...output,
                deviceSetting: 'upgraded',
                links: [...output.links, {plugin: 'a-source', kind: 'added-by-device'}],
            };
        },
    });
    try {
        const opaque = {plugin: 'uninstalled', kind: 'private', mutators: {keep: true}};
        const original = {
            plugin: 'z-device',
            id: 'keep',
            links: [{plugin: 'a-source', kind: 'old'}, {plugin: 'a-source', kind: 'remove'}, opaque],
        };
        const config: Config = {
            version: CONFIG_VERSION,
            plugins: {'a-source': {version: 1}, 'z-device': {version: 1}},
            outputs: [
                original,
                {plugin: 'z-device', id: 'remove', links: [{plugin: 'a-source', kind: 'discarded-device'}]},
                {plugin: 'uninstalled', id: 'keep', links: [{plugin: 'a-source', kind: 'on-unknown-device'}, opaque]},
            ],
        };
        upgradeConfig(config);
        assert.equal(config.outputs.length, 2);
        assert.notEqual(config.outputs[0], original);
        assert.deepEqual(config.outputs[0], {
            plugin: 'z-device',
            id: 'keep',
            deviceSetting: 'upgraded',
            links: [
                {plugin: 'a-source', kind: 'upgraded', previousKind: 'old'},
                opaque,
                {plugin: 'a-source', kind: 'upgraded', previousKind: 'added-by-device'},
            ],
        });
        assert.deepEqual(config.outputs[1]!.links, [
            {plugin: 'a-source', kind: 'upgraded', previousKind: 'on-unknown-device'},
            opaque,
        ]);
        assert.deepEqual(config.plugins, {'a-source': {version: 2}, 'z-device': {version: 2}});
        assert.deepEqual(calls, ['old', 'remove', 'added-by-device', 'on-unknown-device']);
        const reloaded = freeze(JSON.parse(JSON.stringify(config)) as Config, true);
        assert.equal(upgradeConfig(reloaded), reloaded);
        assert.deepEqual(reloaded, config);
        assert.equal(calls.length, 4);
    } finally {
        unregisterSource();
        unregisterDevice();
    }
});

test('a failed record transform does not advance plugin versions', () => {
    const unregister = registerPluginConfiguration({
        id: 'example',
        defaults: {version: 2},
        upgradeLink() { throw new Error('Upgrade failed'); },
    });
    try {
        const config: Config = {
            version: CONFIG_VERSION,
            plugins: {example: {version: 1}},
            outputs: [{plugin: 'uninstalled', id: 'one', links: [{plugin: 'example', kind: 'old'}]}],
        };
        assert.throws(() => upgradeConfig(config), /Upgrade failed/);
        assert.equal(config.plugins['example']!.version, 1);
    } finally {
        unregister();
    }
});

test('a stale unregister callback cannot remove a new registration with the same ID', () => {
    const old = registerPluginConfiguration({id: 'example', defaults: {version: 1}});
    old();
    const current = registerPluginConfiguration({id: 'example', defaults: {version: 1}});
    try {
        old();
        assert.equal(getPluginConfigurations().filter(plugin => plugin.id === 'example').length, 1);
    } finally {
        current();
    }
});
