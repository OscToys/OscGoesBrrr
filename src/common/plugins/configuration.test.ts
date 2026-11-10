import assert from 'node:assert/strict';
import {test} from 'node:test';
import {produce} from 'immer';
import {getDefaultConfig, getDefaultLinks} from './configuration';
import {normalizeConfigDraft} from '../../main/services/configNormalization';
import {importLegacyLinks as vrchatLinks} from '../../plugins/vrchat/main/legacyLinks';
import {importLegacyLinks as audioLinks} from '../../plugins/audio/main/legacyLinks';
import {importLegacyLinks as constantLinks} from '../../plugins/constant/main/legacyLinks';
import type {LegacyLinkOptions} from '../../main/plugins/LegacyLinkOptions';

test('plugin config composition preserves startup defaults and independent default links', () => {
    assert.deepEqual(getDefaultConfig(), {
        version: 4,
        useIntifaceMdns: true,
        useOscQuery: true,
        oscProxy: [],
        outputs: [],
    });
    const links = getDefaultLinks();
    assert.deepEqual(links.map(link => link.kind), ['vrchat.sps.plug', 'vrchat.sps.socket', 'vrchat.sps.touch']);
    assert.notEqual(links[0], getDefaultLinks()[0]);
    assert.notEqual(getDefaultConfig().oscProxy, getDefaultConfig().oscProxy);
});

test('plugin normalizers preserve load versus edit behavior without changing saved keys', () => {
    const config = {
        ...getDefaultConfig(),
        intifaceAddress: '127.0.0.1:12345',
        oscProxy: ['9000', '9001', '192.168.1.2:9000', ''],
    };
    const edited = produce(config, draft => normalizeConfigDraft(draft, 'mutate'));
    assert.equal(edited.intifaceAddress, undefined);
    assert.deepEqual(edited.oscProxy, ['', '', '192.168.1.2:9000', '']);
    const loaded = produce(config, draft => normalizeConfigDraft(draft, 'load'));
    assert.deepEqual(loaded.oscProxy, ['192.168.1.2:9000']);
    const remote = produce(config, draft => {
        draft.intifaceAddress = '192.168.1.2';
        normalizeConfigDraft(draft, 'load');
    });
    assert.equal(remote.intifaceAddress, 'ws://192.168.1.2:12345');
});

test('plugin-owned legacy link conversion retains old filters, parties and modifiers', () => {
    const options: LegacyLinkOptions = {
        type: 'pen',
        include: ['one'],
        bindKeys: ['Custom'],
        touchSelf: true,
        touchOthers: false,
        selfDepth: true,
        othersDepth: false,
        frotOthers: true,
        motionBased: true,
        idleLevel: -0.25,
        scale: 2,
        legacyAudioMultiplier: 3,
    };
    const links = vrchatLinks(options);
    assert.deepEqual(links.map(link => link.kind), ['vrchat.sps.plug', 'vrchat.sps.touch', 'vrchat.avatarParameter']);
    const plug = links[0];
    assert.equal(plug?.kind, 'vrchat.sps.plug');
    if (plug?.kind !== 'vrchat.sps.plug') throw new Error('Missing plug link');
    assert.deepEqual(plug.filter, {include: ['one'], exclude: []});
    assert.equal(plug.ownHands, true);
    assert.equal(plug.otherHands, false);
    assert.equal(plug.mySockets, true);
    assert.equal(plug.otherSockets, false);
    assert.deepEqual(plug.mutators, [
        {kind: 'deadZone', level: 0.2},
        {kind: 'scale', scale: 2},
        {kind: 'motionBased'},
    ]);
    assert.notEqual(plug.mutators, links[1]?.mutators);
    assert.deepEqual(audioLinks(options), [{kind: 'systemAudio', mutators: [{kind: 'scale', scale: 6}]}]);
    assert.deepEqual(constantLinks(options), []);
    assert.deepEqual(constantLinks({...options, idleLevel: 0.25}), [{kind: 'constant', level: 0.25}]);
    assert.deepEqual(vrchatLinks({...options, type: 'orf'}).map(link => link.kind), [
        'vrchat.sps.socket',
        'vrchat.sps.touch',
        'vrchat.avatarParameter',
    ]);
});
