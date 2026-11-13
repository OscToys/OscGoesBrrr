import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Plugin} from './Plugin';
import PluginRuntime from './PluginRuntime';
import type {PluginContext} from './PluginContext';
import {createPluginHost} from './testHost';
import {poll} from './poll';

test('duplicate plugin IDs fail before startup', () => {
    class Duplicate extends Plugin { readonly id = 'duplicate'; }
    assert.throws(() => new PluginRuntime([new Duplicate(), new Duplicate()], createPluginHost().host), /Duplicate|duplicate/);
});

test('startup runs once in order; shutdown removes IPC and cleans up in reverse order once', async () => {
    const calls: string[] = [];
    const {host, handlers} = createPluginHost();
    class First extends Plugin {
    readonly id = 'test.First';
        override async start(context: PluginContext) {
            calls.push('first');
            context.handleIpc('fft:status', () => {});
            context.onCleanup(() => {
                assert.equal(context.signal.aborted, true);
                calls.push('stop first');
            });
        }
    }
    class Second extends Plugin {
    readonly id = 'test.Second';
        override async start(context: PluginContext) {
            calls.push('second');
            context.onCleanup(() => { calls.push('stop second'); });
        }
    }
    const runtime = new PluginRuntime([new First(), new Second()], host);
    const startup = runtime.start();
    assert.equal(runtime.start(), startup);
    assert.equal(await startup, true);
    assert.deepEqual(calls, ['first', 'second']);
    assert.equal(handlers.size, 1);
    runtime.stop();
    runtime.stop();
    assert.equal(handlers.size, 0);
    assert.deepEqual(calls, ['first', 'second', 'stop second', 'stop first']);
});

test('a failed startup rolls back all registered resources and skips later plugins', async () => {
    let cleaned = 0;
    let laterStarted = false;
    const {host, handlers} = createPluginHost();
    class Failing extends Plugin {
    readonly id = 'test.Failing';
        override async start(context: PluginContext) {
            context.handleIpc('fft:status', () => {});
            context.onCleanup(() => { cleaned++; });
            throw new Error('Failed to start');
        }
    }
    class Later extends Plugin {
    readonly id = 'test.Later';
        override async start() { laterStarted = true; }
    }
    const runtime = new PluginRuntime([new Failing(), new Later()], host);
    await assert.rejects(runtime.start(), /Failed to start/);
    assert.equal(cleaned, 1);
    assert.equal(handlers.size, 0);
    assert.equal(laterStarted, false);
});

test('shutdown during startup cleans up late resources and never reports readiness', async () => {
    let resume!: () => void;
    let cleaned = 0;
    const pending = new Promise<void>(resolve => { resume = resolve; });
    class Slow extends Plugin {
    readonly id = 'test.Slow';
        override async start(context: PluginContext) {
            await pending;
            context.onCleanup(() => { cleaned++; });
        }
    }
    const runtime = new PluginRuntime([new Slow()], createPluginHost().host);
    const startup = runtime.start();
    runtime.stop();
    resume();
    assert.equal(await startup, false);
    assert.equal(cleaned, 1);
});

test('cleanup continues after a failing disposer', async () => {
    let cleaned = false;
    class BrokenCleanup extends Plugin {
    readonly id = 'test.BrokenCleanup';
        override async start(context: PluginContext) {
            context.onCleanup(() => { cleaned = true; });
            context.onCleanup(() => { throw new Error('Cleanup failed'); });
        }
    }
    const runtime = new PluginRuntime([new BrokenCleanup()], createPluginHost().host);
    await runtime.start();
    assert.throws(() => runtime.stop(), AggregateError);
    assert.equal(cleaned, true);
    runtime.stop();
});

test('async polling does not overlap or reschedule when shutdown happens during a call', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    let finish!: () => void;
    let calls = 0;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    class Polling extends Plugin {
    readonly id = 'test.Polling';
        override async start(context: PluginContext) {
            poll(context, 100, async () => { calls++; await pending; }, error => assert.fail(String(error)));
        }
    }
    const runtime = new PluginRuntime([new Polling()], createPluginHost().host);
    await runtime.start();
    t.mock.timers.tick(1000);
    assert.equal(calls, 1);
    runtime.stop();
    finish();
    await pending;
    t.mock.timers.tick(1000);
    assert.equal(calls, 1);
});
