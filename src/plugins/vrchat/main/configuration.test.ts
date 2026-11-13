import assert from 'node:assert/strict';
import {test} from 'node:test';
import {freeze, produce} from 'immer';
import {getDefaultConfig, getDefaultLinks, normalizePluginConfig, upgradeConfig} from '../../../common/application/configuration';
import '../../audio/shared/config';
import '../../constant/shared/config';
import {getSettings as intifaceSettings} from '../../intiface/shared/config';
import type {Config} from '../../../common/application/configTypes';
import {getSettings, isZoneLink, setInteractionParty} from '../shared/config';

function legacyConfig(version = 4) {
    return {version, useIntifaceMdns: true, useOscQuery: true, oscProxy: []};
}

test('current config versions accept frozen defaults without assigning to them', () => {
    const defaults = freeze(getDefaultConfig(), true);
    assert.equal(upgradeConfig(defaults), defaults);
    assert.deepEqual(defaults, getDefaultConfig());
    assert.throws(() => upgradeConfig({...getDefaultConfig(), version: 999}), /Unsupported config version/);
});

test('plugin config composition has exactly three root keys and independent versioned sections', () => {
    assert.deepEqual(getDefaultConfig(), {
        version: 5,
        outputs: [],
        plugins: {
            vrchat: {version: 1, useOscQuery: true, oscProxy: []},
            intiface: {version: 1, useIntifaceMdns: true},
            audio: {version: 1},
            constant: {version: 1},
        },
    });
    const links = getDefaultLinks();
    assert.deepEqual(links.map(link => link.kind), ['vrchat.sps.plug', 'vrchat.sps.socket', 'vrchat.sps.touch']);
    assert.notEqual(links[0], getDefaultLinks()[0]);
    assert.notEqual(getSettings(getDefaultConfig()).oscProxy, getSettings(getDefaultConfig()).oscProxy);
});

test('plugin normalizers preserve load versus edit behavior within their own sections', () => {
    const config = getDefaultConfig();
    intifaceSettings(config).intifaceAddress = '127.0.0.1:12345';
    getSettings(config).oscProxy = ['9000', '9001', '192.168.1.2:9000', ''];
    const edited = produce(config, draft => normalizePluginConfig(draft, 'mutate'));
    assert.equal(intifaceSettings(edited).intifaceAddress, undefined);
    assert.deepEqual(getSettings(edited).oscProxy, ['', '', '192.168.1.2:9000', '']);
    const loaded = produce(config, draft => normalizePluginConfig(draft, 'load'));
    assert.deepEqual(getSettings(loaded).oscProxy, ['192.168.1.2:9000']);
    const remote = produce(config, draft => {
        intifaceSettings(draft).intifaceAddress = '192.168.1.2';
        normalizePluginConfig(draft, 'load');
    });
    assert.equal(intifaceSettings(remote).intifaceAddress, 'ws://192.168.1.2:12345');
});

for (const motionBased of [false, true]) {
    for (const self of [false, true]) {
        for (const others of [false, true]) {
            test('committed v4 interactions upgrade directly to groups ' + JSON.stringify({motionBased, self, others}), () => {
                const common = {
                    filter: {include: ['Test'], exclude: []},
                    ownHands: self,
                    otherHands: others,
                    mutators: [
                        {kind: 'deadZone', level: 0.2},
                        {kind: 'scale', scale: 2},
                        ...(motionBased ? [{kind: 'motionBased'}] : []),
                    ],
                };
                const oldLinks = [
                    {...structuredClone(common), kind: 'vrchat.sps.plug', mySockets: self, otherSockets: others, otherPlugs: others},
                    {...structuredClone(common), kind: 'vrchat.sps.socket', myPlugs: self, otherPlugs: others, otherSockets: others},
                    {...structuredClone(common), kind: 'vrchat.sps.touch'},
                    {kind: 'vrchat.avatarParameter', parameter: 'Custom', mutators: [{kind: 'motionBased'}]},
                    {kind: 'systemAudio', mutators: [{kind: 'scale', scale: 3}]},
                    {kind: 'constant', level: 0.2},
                ];
                const config = {
                    ...legacyConfig(),
                    maxLevelParam: 'Maximum',
                    vrcConfigDir: 'custom-directory',
                    intifaceAddress: 'ws://192.168.1.2:12345',
                    outputs: [{
                        id: 'intiface.1.0',
                        preferLinear: true,
                        linear: {min: 0.1, max: 0.8},
                        updatesPerSecond: 30,
                        links: oldLinks,
                    }],
                };
                const upgraded = upgradeConfig(config) as Config;
                assert.deepEqual(Object.keys(upgraded).sort(), ['outputs', 'plugins', 'version']);
                assert.equal(upgraded.version, 5);
                assert.equal(getSettings(upgraded).maxLevelParam, 'Maximum');
                assert.equal(getSettings(upgraded).vrcConfigDir, 'custom-directory');
                assert.equal(intifaceSettings(upgraded).intifaceAddress, 'ws://192.168.1.2:12345');
                const links = upgraded.outputs[0]!.links;
                assert.deepEqual(links.map(link => link.plugin), ['vrchat', 'vrchat', 'vrchat', 'vrchat', 'audio', 'constant']);
                for (const link of links.slice(0, 3)) {
                    if (!isZoneLink(link)) throw new Error('Expected zone link');
                    assert.deepEqual(link.hands, {mode: self || others ? 'movement' : 'off', self, others: others || !self});
                    assert.deepEqual(link.filter, common.filter);
                    const depth = {
                        mode: self || others ? motionBased ? 'movement' : 'proximity' : 'off',
                        self,
                        others: others || !self,
                    };
                    const matching = {mode: others ? 'movement' : 'off', self: false, others: true};
                    if (link.kind === 'vrchat.sps.plug') {
                        assert.deepEqual(link.plugs, matching);
                        assert.deepEqual(link.sockets, depth);
                    }
                    if (link.kind === 'vrchat.sps.socket') {
                        assert.deepEqual(link.sockets, matching);
                        assert.deepEqual(link.plugs, depth);
                    }
                    assert.ok(!('ownHands' in link) && !('otherHands' in link));
                    assert.deepEqual(link.mutators, [{kind: 'deadZone', level: 0.2}, {kind: 'scale', scale: 2}]);
                }
                assert.deepEqual(links[3]!['mutators'], []);
                assert.deepEqual(links[4]!['mutators'], [{kind: 'scale', scale: 3}]);
                assert.equal(links[5]!['level'], 0.2);
                assert.deepEqual(upgraded.outputs[0]!['linear'], {min: 0.1, max: 0.8});
                assert.equal(upgraded.outputs[0]!['preferLinear'], true);
                assert.equal(upgraded.outputs[0]!['updatesPerSecond'], 30);
                assert.equal(upgradeConfig(freeze(upgraded, true)), upgraded);
            });
        }
    }
}

test('old JSON contact names still convert directly; removed imported placeholders do not survive', () => {
    const upgraded = upgradeConfig({
        ...legacyConfig(1),
        outputs: [
            {
                id: 'intiface.1.0',
                links: [
                    {
                        kind: 'vrchat.sps.plug',
                        filter: {include: [], exclude: []},
                        touchSelf: true,
                        touchOthers: false,
                        penSelf: false,
                        penOthers: true,
                        frotOthers: true,
                        mutators: [],
                    },
                    {kind: 'vrchat.sps.touch', filter: {include: [], exclude: []}, mutators: []},
                ],
            },
            {id: 'intiface.imported.all', links: []},
        ],
    }) as Config;
    assert.equal(upgraded.outputs.length, 1);
    const links = upgraded.outputs[0]!.links;
    assert.deepEqual(links[0]!['hands'], {mode: 'movement', self: true, others: false});
    assert.deepEqual(links[0]!['sockets'], {mode: 'proximity', self: false, others: true});
    assert.deepEqual(links[1]!['hands'], {mode: 'movement', self: false, others: true});
    assert.equal(intifaceSettings(upgraded).useIntifaceMdns, false);
    assert.equal(getSettings(upgraded).useOscQuery, true);
});

test('party selection permits both players and switches to the other when the last is unchecked', () => {
    for (const mode of ['off', 'movement', 'proximity'] as const) {
        const own = {mode, self: true, others: false};
        const both = setInteractionParty(own, 'others', true);
        assert.deepEqual(both, {mode, self: true, others: true});
        const others = setInteractionParty(own, 'self', false);
        assert.deepEqual(others, {mode, self: false, others: true});
        assert.deepEqual(setInteractionParty(others, 'others', false), own);
        assert.deepEqual(setInteractionParty(both, 'self', false), others);
        assert.deepEqual(setInteractionParty(both, 'others', false), own);
    }
});
