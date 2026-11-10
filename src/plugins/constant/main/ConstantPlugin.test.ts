import assert from 'node:assert/strict';
import {test} from 'node:test';
import ConstantPlugin from './ConstantPlugin';

test('constant resolver preserves its level and identity, excludes linear outputs, and declines other links', () => {
    const resolveConstant = new ConstantPlugin().snapshot();
    assert.deepEqual(resolveConstant({kind: 'constant', level: 0.4}, 3, false), [
        {id: '3', value: 0.4, kind: 'intensity'},
    ]);
    assert.deepEqual(resolveConstant({kind: 'constant', level: 1}, 3, true), []);
    assert.equal(resolveConstant({kind: 'systemAudio', mutators: []}, 0, false), undefined);
});
