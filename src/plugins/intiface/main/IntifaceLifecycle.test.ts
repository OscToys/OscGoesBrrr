import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Intiface from './Intiface';
import IntifacePlugin from './IntifacePlugin';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';
import TypedEventEmitter from '../../../common/TypedEventEmitter';
import {getDefaultConfig} from '../../../common/application/configuration';
import type {Config} from '../../../common/application/configTypes';

test('Intiface supplies stable handles, its own config and resolved frames', () => {
    const endpoint = {id: 'shared-id', type: 'vibrate', lastLevel: 0, setLevel() {}};
    const ownConfig = {plugin: 'intiface', id: 'shared-id', links: [{plugin: 'constant', kind: 'constant', level: 0.4}], enabled: false};
    const config = {
        getCached: () => ({...getDefaultConfig(), outputs: [ownConfig, {plugin: 'other', id: 'shared-id', links: []}]}),
    };
    const plugin = new IntifacePlugin(
        {getDevices: () => [endpoint]} as unknown as ConstructorParameters<typeof IntifacePlugin>[0],
        {} as ConstructorParameters<typeof IntifacePlugin>[1],
        config as unknown as ConstructorParameters<typeof IntifacePlugin>[2],
    );
    const inputs = [{inputs: [], modifiers: []}];
    const resolve = (links: unknown, linear: boolean) => {
        assert.equal(links, ownConfig.links);
        assert.equal(linear, false);
        return inputs;
    };
    const first = Array.from(plugin.getOutputs(resolve))[0]!;
    const next = Array.from(plugin.getOutputs(resolve))[0]!;
    assert.equal(first.output, endpoint);
    assert.equal(next.output, endpoint);
    assert.equal(first.inputs, inputs);
    assert.deepEqual(first.settings, {enabled: false, linear: undefined});
    assert.deepEqual(Array.from(plugin.getOutputConfigs()), [ownConfig]);
});

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
        {get: () => ({log() {}})} as unknown as ConstructorParameters<typeof Intiface>[3],
    );
    assert.equal(config.listenerCount('changed'), 0);
    assert.equal(intiface.reconnectTimer, undefined);
    const plugin = new IntifacePlugin(
        intiface,
        {} as ConstructorParameters<typeof IntifacePlugin>[1],
        config as unknown as ConstructorParameters<typeof IntifacePlugin>[2],
    );
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
