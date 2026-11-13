/// <reference types="node" />
import assert from 'node:assert/strict';
import {test} from 'node:test';
import onDocumentReady from './onDocumentReady';

for (const readyState of ['interactive', 'complete'] as const) {
    test(`renderer mounts immediately when the document is ${readyState}`, () => {
        let mounted = false;
        onDocumentReady(() => { mounted = true; }, {
            readyState,
            addEventListener() { assert.fail('DOMContentLoaded has already fired'); },
        });
        assert.equal(mounted, true);
    });
}

test('renderer waits for DOMContentLoaded only while the document is loading', () => {
    let mounted = false;
    const mount = () => { mounted = true; };
    onDocumentReady(mount, {
        readyState: 'loading',
        addEventListener(type: string, listener: unknown, options?: boolean | AddEventListenerOptions) {
            assert.equal(type, 'DOMContentLoaded');
            assert.equal(listener, mount);
            assert.deepEqual(options, {once: true});
            assert.equal(mounted, false);
            mount();
        },
    });
    assert.equal(mounted, true);
});
