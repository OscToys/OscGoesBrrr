import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectLinkInputs, type LinkInputResolver} from './linkInputs';
import {evaluateRoutes} from '../routing';
import ConstantPlugin from '../../plugins/constant/main/ConstantPlugin';
import AudioPlugin from '../../plugins/audio/main/AudioPlugin';

test('each link is sent only to its plugin, including identical kind strings', () => {
    const called: string[] = [];
    const resolver = (owner: string, value: number): LinkInputResolver => (_link, index) => {
        called.push(owner);
        return {inputs: [{id: String(index), value, kind: 'intensity'}], modifiers: []};
    };
    const resolvers = new Map<string, LinkInputResolver>([
        ['a', resolver('a', 0.3)],
        ['b', resolver('b', 0.6)],
    ]);
    const links = [{plugin: 'a', kind: 'same'}, {plugin: 'b', kind: 'same'}, {plugin: 'missing', kind: 'same'}];
    const resolved = collectLinkInputs(links, false, resolvers);
    assert.deepEqual(called, ['a', 'b']);
    assert.deepEqual(resolved[2]!.inputs, []);
    assert.deepEqual(evaluateRoutes(resolved, new Map(), 100, true).links.map(link => link.output), [0.3, 0.6, 0]);
    links[0]!.plugin = 'missing';
    assert.deepEqual(collectLinkInputs(links, false, resolvers)[0]!.inputs, []);
});

test('disabled links and missing plugins preserve indices and payloads without contributing', () => {
    const unknown = {
        plugin: 'future',
        kind: 'constant',
        options: {nested: [1, 'keep']},
        mutators: [{kind: 'future-modifier', amount: 2}],
    };
    const original = structuredClone(unknown);
    const links = [
        unknown,
        {plugin: 'constant', kind: 'constant', level: 0.9, enabled: false},
        {plugin: 'constant', kind: 'constant', level: 0.3},
    ];
    const resolvers = new Map([['constant', new ConstantPlugin().snapshot()]]);
    const resolved = collectLinkInputs(links, false, resolvers);
    assert.deepEqual(resolved[0]!.inputs, []);
    assert.deepEqual(resolved[1]!.inputs, []);
    assert.equal(resolved[2]!.inputs[0]!.id, JSON.stringify(['constant', 2, '2']));
    assert.equal(evaluateRoutes(resolved, new Map(), 100, true).output.output, 0.3);
    assert.deepEqual(unknown, original);
});

test('plugin-local linear exclusions still apply', () => {
    const resolvers = new Map([
        ['constant', new ConstantPlugin().snapshot()],
        ['audio', new AudioPlugin().snapshot()],
    ]);
    const resolved = collectLinkInputs([
        {plugin: 'constant', kind: 'constant', level: 1},
        {plugin: 'audio', kind: 'systemAudio', mutators: []},
    ], true, resolvers);
    assert.ok(resolved.every(link => link.inputs.length === 0));
});

test('unhandled payloads stay opaque and only the owner supplies engine modifiers', () => {
    const links = [
        {plugin: 'uninstalled', kind: 'future', mutators: [{kind: 'future-modifier', amount: 2}]},
        {plugin: 'constant', kind: 'future', mutators: {private: true}},
        {plugin: 'example', kind: 'custom', mutators: {private: true}},
    ];
    const before = structuredClone(links);
    const resolvers = new Map<string, LinkInputResolver>([
        ['constant', new ConstantPlugin().snapshot()],
        ['example', link => {
            assert.deepEqual(link['mutators'], {private: true});
            return {
                inputs: [{id: 'one', value: 0.3, kind: 'intensity'}],
                modifiers: [{kind: 'scale', scale: 2}],
            };
        }],
    ]);
    const resolved = collectLinkInputs(links, false, resolvers);
    assert.deepEqual(resolved.slice(0, 2), [{inputs: [], modifiers: []}, {inputs: [], modifiers: []}]);
    assert.equal(evaluateRoutes(resolved, new Map(), 100, true).output.output, 0.6);
    assert.deepEqual(links, before);
});
