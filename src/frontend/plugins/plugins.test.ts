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
import type {SettingsStatePayload} from '../../common/ipcContract';

test('plugin link definitions preserve the menu order, defaults and modifier capabilities', () => {
    const plugins: FrontendPlugin[] = [audio, constant, vrchat];
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
        assert.equal(definition.create().kind, definition.kind);
        assert.notEqual(definition.create(), definition.create());
    }
    const audioDefinition = definitions[3]!;
    assert.deepEqual(audioDefinition.modifiers?.kinds, ['scale']);
    assert.deepEqual(audioDefinition.modifiers?.set(audioDefinition.create(), [
        {kind: 'scale', scale: 2},
        {kind: 'motionBased'},
    ]), {kind: 'systemAudio', mutators: [{kind: 'scale', scale: 2}]});
    assert.equal(definitions[4]!.summary(definitions[4]!.create()), '10%');
    assert.equal(definitions[0]!.summary(definitions[0]!.create()), 'All Plugs');
    assert.equal(definitions[5]!.summary(definitions[5]!.create()), 'Unset');
});

test('Intiface output diagnostics subscribe to live connection changes and retain imported naming', () => {
    const store = createStore();
    const settings = atom({intifaceConnected: false} as SettingsStatePayload);
    const outputId = atom('intiface.imported.all');
    const info = atom(undefined);
    const presentation = outputPresentation({outputId, info, settings});
    assert.equal(store.get(presentation).name, 'Imported Device: all');
    assert.match(String(store.get(presentation).alerts.at(-1)?.content), /Intiface is not connected/);
    store.set(settings, {intifaceConnected: true} as SettingsStatePayload);
    assert.match(String(store.get(presentation).alerts.at(-1)?.content), /not connected to Intiface/);
    store.set(outputId, 'device');
    assert.equal(store.get(presentation).name, undefined);
    assert.equal(store.get(presentation).alerts.length, 1);
});

test('Intiface imported expiry warning renders without owning a separate timer in shared rows', () => {
    const store = createStore();
    const presentation = outputPresentation({
        outputId: atom('intiface.imported.all'),
        info: atom(undefined),
        settings: atom({intifaceConnected: true, importedDeletesAt: Date.now() + 60000} as SettingsStatePayload),
    });
    const warning = store.get(presentation).alerts.find(alert => typeof alert.content !== 'string');
    assert.ok(warning);
    assert.match(renderToStaticMarkup(warning.content), /will expire/);
});
