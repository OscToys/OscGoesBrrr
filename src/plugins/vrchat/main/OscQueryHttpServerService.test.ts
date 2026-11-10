import 'reflect-metadata';
import assert from 'node:assert/strict';
import http from 'node:http';
import {test} from 'node:test';
import OscQueryHttpServerService from './OscQueryHttpServerService';
import {Plugin} from '../../../main/plugins/Plugin';
import type {PluginContext} from '../../../main/plugins/PluginContext';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';

function runtimeForPort(port: number) {
    const service = new OscQueryHttpServerService(
        {get: async () => port} as unknown as ConstructorParameters<typeof OscQueryHttpServerService>[0],
        {get: () => ({log() {}})} as unknown as ConstructorParameters<typeof OscQueryHttpServerService>[1],
    );
    class HttpPlugin extends Plugin {
        override async start(context: PluginContext) { await service.start(context); }
    }
    return new PluginRuntime([new HttpPlugin()], createPluginHost().host);
}

test('shutdown between HTTP binding and the listening event settles real plugin startup', {timeout: 2000}, async t => {
    const runtime = runtimeForPort(0);
    const createServer = http.createServer;
    const closed = Promise.withResolvers<void>();
    t.after(() => runtime.stop());
    t.mock.method(http, 'createServer', (handler: http.RequestListener) => {
        const server = createServer(handler);
        server.once('close', closed.resolve);
        // Let the loopback lookup bind first, then stop before `listening` is emitted.
        process.nextTick(() => process.nextTick(() => {
            assert.equal(server.listening, true);
            runtime.stop();
        }));
        return server;
    });
    assert.equal(await runtime.start(), false);
    await closed.promise;
});

test('HTTP startup still succeeds normally and shutdown closes the listener', {timeout: 2000}, async t => {
    const runtime = runtimeForPort(0);
    const createServer = http.createServer;
    const closed = Promise.withResolvers<void>();
    let server: http.Server | undefined;
    t.after(() => runtime.stop());
    t.mock.method(http, 'createServer', (handler: http.RequestListener) => {
        server = createServer(handler);
        server.once('close', closed.resolve);
        return server;
    });
    assert.equal(await runtime.start(), true);
    assert.equal(server?.listening, true);
    runtime.stop();
    await closed.promise;
    assert.equal(server?.listening, false);
});

test('HTTP binding errors reject startup rather than being treated as cancellation', {timeout: 2000}, async t => {
    const blocker = http.createServer();
    t.after(() => blocker.close());
    await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    assert.ok(address && typeof address !== 'string');
    const runtime = runtimeForPort(address.port);
    t.after(() => runtime.stop());
    await assert.rejects(runtime.start(), {code: 'EADDRINUSE'});
});
