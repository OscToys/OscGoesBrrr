/// <reference types="node" />
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {atom, createStore} from 'jotai';
import {renderToStaticMarkup} from 'react-dom/server';
import audio from '../../plugins/audio/frontend/AudioPlugin';
import constant from '../../plugins/constant/frontend/ConstantPlugin';
import vrchat from '../../plugins/vrchat/frontend/VrchatPlugin';
import {outputPresentation} from '../../plugins/intiface/frontend/outputPresentation';
import type {FrontendPlugin} from './Plugin';
import type {SettingsStatePayload} from '../../common/application/ipcContract';
import {summarizeLink, summarizeSelection} from '../../plugins/vrchat/frontend/LinkSummary';
import {getDefaultLinks} from '../../plugins/vrchat/shared/config';
import {createElement} from 'react';
import {SettingsStateAtomProvider} from '../components/settings/SettingsStateAtomContext';

test('every zone interaction has an exclusive Off / Movement / Proximity selector', () => {
    const settings = atom({
        vrchat: {detectedSpsPlugIds: [], detectedSpsSocketIds: [], detectedSpsTouchZoneIds: []},
    } as unknown as SettingsStatePayload);
    for (const definition of vrchat.links.slice(0, 3)) {
        const markup = renderToStaticMarkup(createElement(
            SettingsStateAtomProvider,
            {
                atom: settings,
                children: createElement(definition.Editor!, {linkAtom: atom(definition.create())}),
            },
        ));
        const count = definition.kind === 'vrchat.sps.touch' ? 1 : 3;
        const partyCount = definition.kind === 'vrchat.sps.touch' ? 1 : 2;
        assert.equal((markup.match(/value="off"/g) ?? []).length, count);
        assert.equal((markup.match(/value="movement"/g) ?? []).length, count);
        assert.equal((markup.match(/value="proximity"/g) ?? []).length, count);
        assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, count * 2);
        assert.equal((markup.match(/value="self"/g) ?? []).length, partyCount);
        assert.equal((markup.match(/value="others"/g) ?? []).length, count);
        assert.equal((markup.match(/>My Own</g) ?? []).length, partyCount);
        assert.equal((markup.match(/>Other Players</g) ?? []).length, count);
        const fixedPlayers = (markup.match(/<button\b[^>]*>/g) ?? [])
            .filter(button => /value="others"/.test(button) && /disabled=""/.test(button));
        assert.equal(fixedPlayers.length, count - partyCount);
        for (const button of fixedPlayers) assert.match(button, /aria-pressed="true"/);
        for (const button of markup.match(/<button\b[^>]*>/g) ?? []) {
            if (/value="off"/.test(button)) assert.match(button, /MuiToggleButton-standard/);
            if (/value="movement"|value="proximity"/.test(button)) assert.match(button, /MuiToggleButton-primary/);
        }
        assert.deepEqual(definition.modifiers?.kinds, ['scale', 'deadZone']);
    }
    assert.deepEqual(vrchat.links[3]!.modifiers?.kinds, ['scale', 'deadZone']);
});

test('SPS titles show zone types and subtitles connect selections to enabled interaction types', () => {
    for (const [index, label] of ['SPS Plugs', 'SPS Sockets', 'SPS Touch Zones'].entries()) {
        assert.equal(vrchat.links[index]!.label, label);
        assert.equal(vrchat.links[index]!.title, undefined);
    }
    const socket = getDefaultLinks()[1]!;
    if (socket.kind !== 'vrchat.sps.socket') throw new Error('Expected socket link');
    const full = renderToStaticMarkup(summarizeLink({
        ...socket,
        plugs: {...socket.plugs, self: true},
        hands: {...socket.hands, self: true},
    }));
    assert.ok(full.startsWith('All '));
    assert.match(full, /data-icon="arrows-left-right"/);
    assert.ok(full.endsWith(' Other Plugs, Other Hands, Other Sockets, My Plugs, My Hands'));
    assert.doesNotMatch(full, /Touching/);
    const filteredLink = {
        ...socket,
        filter: {include: [' Custom '], exclude: ['Ignored']},
        plugs: {...socket.plugs, mode: 'off' as const},
        hands: {...socket.hands, mode: 'off' as const},
        sockets: {...socket.sockets, mode: 'off' as const},
    };
    const filtered = renderToStaticMarkup(summarizeLink(filteredLink));
    assert.equal(summarizeSelection(filteredLink), 'Custom, -Ignored');
    assert.ok(filtered.startsWith('Custom, -Ignored '));
    assert.match(filtered, /data-icon="arrows-left-right"/);
    assert.ok(filtered.endsWith(' None'));
    assert.doesNotMatch(filtered, /Other Plugs|Other Hands|Other Sockets/);
    const touch = getDefaultLinks()[2]!;
    if (touch.kind !== 'vrchat.sps.touch') throw new Error('Expected touch link');
    const touchSummary = renderToStaticMarkup(summarizeLink({...touch, hands: {...touch.hands, self: true}}));
    assert.ok(touchSummary.startsWith('All '));
    assert.match(touchSummary, /data-icon="arrows-left-right"/);
    assert.ok(touchSummary.endsWith(' Other Hands, My Hands'));
});

test('plugin link definitions preserve the menu order, defaults and modifier capabilities', () => {
    const plugins: FrontendPlugin[] = [audio, constant, vrchat];
    for (const plugin of plugins) {
        for (const definition of plugin.links ?? []) assert.equal(definition.plugin, plugin.id);
    }
    const definitions = plugins.flatMap(plugin => plugin.links ?? []).sort((a, b) => a.order - b.order);
    assert.deepEqual(definitions.map(definition => definition.kind), [
        'vrchat.sps.plug',
        'vrchat.sps.socket',
        'vrchat.sps.touch',
        'systemAudio',
        'constant',
        'vrchat.avatarParameter',
    ]);
    for (const definition of definitions) {
        assert.equal(definition.create().plugin, definition.plugin);
        assert.equal(definition.create().kind, definition.kind);
        assert.notEqual(definition.create(), definition.create());
    }
    const audioDefinition = definitions[3]!;
    assert.deepEqual(audioDefinition.modifiers?.kinds, ['scale']);
    assert.deepEqual(audioDefinition.modifiers?.set(audioDefinition.create(), [
        {kind: 'scale', scale: 2},
        {kind: 'deadZone', level: 0.2},
    ]), {plugin: 'audio', kind: 'systemAudio', mutators: [{kind: 'scale', scale: 2}]});
    assert.equal(definitions[4]!.summary(definitions[4]!.create()), '10%');
    const plugSummary = renderToStaticMarkup(definitions[0]!.summary(definitions[0]!.create()));
    assert.ok(plugSummary.startsWith('All '));
    assert.match(plugSummary, /data-icon="arrows-left-right"/);
    assert.ok(plugSummary.endsWith(' Other Sockets, Other Hands, Other Plugs'));
    assert.equal(definitions[5]!.summary(definitions[5]!.create()), 'Unset');
});

test('Intiface output diagnostics subscribe to live connection changes', () => {
    const store = createStore();
    const settings = atom({intifaceConnected: false} as SettingsStatePayload);
    const outputId = atom('intiface.1.0');
    const info = atom(undefined);
    const presentation = outputPresentation({outputId, info, settings});
    assert.equal(store.get(presentation)!.name, undefined);
    assert.match(String(store.get(presentation)!.alerts.at(-1)?.content), /Intiface is not connected/);
    store.set(settings, {intifaceConnected: true} as SettingsStatePayload);
    assert.match(String(store.get(presentation)!.alerts.at(-1)?.content), /not connected to Intiface/);
    store.set(outputId, 'device');
    assert.equal(store.get(presentation), undefined);
});
