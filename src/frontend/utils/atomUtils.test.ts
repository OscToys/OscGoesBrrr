import assert from 'node:assert/strict';
import {test} from 'node:test';
import {atom, createStore} from 'jotai';
import type {Config} from '../../common/application/configTypes';
import {focusKeyAtom, pluginConfigAtom} from './atomUtils';

test('plugin settings atoms update only their versioned section and preserve unknown plugin data', () => {
    const store = createStore();
    const config: Config = {
        version: 5,
        outputs: [],
        plugins: {
            example: {version: 1, address: 'old'},
            uninstalled: {version: 42, opaque: {keep: ['all', 'data']}},
        },
    };
    const configAtom = atom(config);
    const sectionAtom = pluginConfigAtom<{version: number; address: string}>(configAtom, 'example');
    const addressAtom = focusKeyAtom(sectionAtom, 'address');
    assert.equal(store.get(addressAtom), 'old');
    store.set(addressAtom, 'new');
    const updated = store.get(configAtom);
    assert.deepEqual(Object.keys(updated).sort(), ['outputs', 'plugins', 'version']);
    assert.deepEqual(updated.plugins['example'], {version: 1, address: 'new'});
    assert.equal(updated.outputs, config.outputs);
    assert.equal(updated.plugins['uninstalled'], config.plugins['uninstalled']);
    assert.deepEqual(config.plugins['example'], {version: 1, address: 'old'});
    store.set(sectionAtom, previous => previous);
    assert.equal(store.get(configAtom), updated);
});
