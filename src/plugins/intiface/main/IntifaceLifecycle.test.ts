import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Intiface from './Intiface';
import IntifacePlugin from './IntifacePlugin';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';
import TypedEventEmitter from '../../../common/TypedEventEmitter';
import {getDefaultConfig} from '../../../common/plugins/configuration';
import type {Config} from '../../../common/configTypes';

test('Intiface waits for plugin startup and releases reconnects and config listeners on shutdown', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const config = Object.assign(
        new TypedEventEmitter<{changed: (config: Config) => void}>(),
        {getCached: getDefaultConfig},
    );
    const intiface = new Intiface(
        config as unknown as ConstructorParameters<typeof Intiface>[0],
        {} as ConstructorParameters<typeof Intiface>[1],
        {} as ConstructorParameters<typeof Intiface>[2],
        {} as ConstructorParameters<typeof Intiface>[3],
        {get: () => ({log() {}})} as unknown as ConstructorParameters<typeof Intiface>[4],
    );
    assert.equal(config.listenerCount('changed'), 0);
    assert.equal(intiface.reconnectTimer, undefined);
    const plugin = new IntifacePlugin(intiface, {} as ConstructorParameters<typeof IntifacePlugin>[1]);
    const {host, handlers} = createPluginHost();
    const runtime = new PluginRuntime([plugin], host);
    await runtime.start();
    assert.equal(config.listenerCount('changed'), 1);
    assert.notEqual(intiface.reconnectTimer, undefined);
    assert.equal(handlers.size, 0, 'global data controls are not registered by Intiface');
    const controller = intiface.reconnectController!;
    runtime.stop();
    assert.equal(controller.signal.aborted, true);
    assert.equal(intiface.reconnectTimer, undefined);
    assert.equal(config.listenerCount('changed'), 0);
    assert.equal(handlers.size, 0);
    config.emit('changed', getDefaultConfig());
    t.mock.timers.tick(10000);
    assert.equal(intiface.reconnectTimer, undefined);
});
