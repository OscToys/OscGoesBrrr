import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectLinkInputs} from './sourceInputs';
import {evaluateRoutes} from './routing';
import type {OutputLink} from '../common/configTypes';
import ConstantPlugin from '../plugins/constant/main/ConstantPlugin';
import AudioPlugin from '../plugins/audio/main/AudioPlugin';

test('adapter inputs route alongside constants and audio without depending on avatar objects', () => {
    const links: OutputLink[] = [
        {kind: 'constant', level: 0.2},
        {kind: 'systemAudio', mutators: [{kind: 'scale', scale: 2}]},
        {kind: 'vrchat.avatarParameter', parameter: 'external', mutators: [{kind: 'scale', scale: 0.5}]},
    ];
    const audio = new AudioPlugin();
    audio.receivedFft(0.3);
    const resolved = collectLinkInputs(links, false, [
        new ConstantPlugin().snapshot(),
        audio.snapshot(),
        () => undefined,
        (_link, index) => [{id: `${index}/external`, value: 0.8, kind: 'position'}],
    ]);
    const result = evaluateRoutes(resolved, new Map(), 100, true);
    assert.deepEqual(result.links.map(link => link.output), [0.2, 0.6, 0.4]);
    assert.equal(result.output.output, 0.6);
    assert.equal(resolved[0]?.inputs[0]?.kind, 'intensity');
});

test('resolver can claim an empty link without falling through, and linear outputs exclude constant/audio', () => {
    const links: OutputLink[] = [
        {kind: 'constant', level: 1},
        {kind: 'systemAudio', mutators: []},
        {kind: 'vrchat.avatarParameter', parameter: 'external', mutators: []},
    ];
    let fallbackCalls = 0;
    const audio = new AudioPlugin();
    audio.receivedFft(1);
    const resolved = collectLinkInputs(links, true, [
        new ConstantPlugin().snapshot(),
        audio.snapshot(),
        (_link, _index, linear) => { assert.equal(linear, true); return []; },
        () => { fallbackCalls++; return undefined; },
    ]);
    assert.ok(resolved.every(link => link.inputs.length === 0));
    assert.equal(fallbackCalls, 0);
    assert.deepEqual(collectLinkInputs([links[2]!], false, [() => undefined])[0]?.inputs, []);
});
