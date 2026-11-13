import assert from 'node:assert/strict';
import {test} from 'node:test';
import OutputController from './OutputController';

test('engine operates on a handle, resolved inputs and settings without plugin IDs, device IDs or link kinds', () => {
    let commanded = 0;
    const controller = new OutputController({
        type: 'vibrate',
        get lastLevel() { return commanded; },
        setLevel(value) { commanded = value; },
    });
    controller.update([
        {inputs: [{id: 'history-key', value: 0.4, kind: 'intensity'}], modifiers: []},
    ], {});
    assert.equal(commanded, 0.4);
    assert.deepEqual(controller.getLastLinkValues(), [0.4]);
});
