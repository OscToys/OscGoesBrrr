import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Bridge from './bridge';
import {Plugin} from './plugins/Plugin';
import type {LinkInputResolver, ResolveLinks} from './plugins/linkInputs';
import type {OutputEndpoint} from './OutputEndpoint';

test('coordinator uses stable handles and plugin-prepared frames without output IDs or config lookup', () => {
    const endpoint = {
        type: 'vibrate',
        lastLevel: 0,
        setLevel(value: number) { this.lastLevel = value; },
    };
    class Source extends Plugin {
        readonly id = 'input';
        override snapshot(): LinkInputResolver {
            return () => ({inputs: [{id: 'sample', value: 0.6, kind: 'intensity'}], modifiers: []});
        }
    }
    class Integration extends Plugin {
        readonly id = 'output';
        endpoints: OutputEndpoint[] = [endpoint];
        reports: number[] = [];
        override getOutputs(resolve: ResolveLinks) {
            return this.endpoints.map(output => ({
                output,
                inputs: resolve([{plugin: 'input', kind: 'internal'}], false),
                settings: {},
            }));
        }
        override afterUpdate(level: number) { this.reports.push(level); }
    }
    const plugin = new Integration();
    const bridge = new Bridge([new Source(), plugin]);
    const original = Array.from(bridge.getOutputs())[0];
    bridge.update();
    assert.equal(endpoint.lastLevel, 0.6);
    assert.equal(plugin.reports.at(-1), 0.6);
    assert.equal(Array.from(bridge.getOutputs())[0], original, 'Fresh frame objects must not reset controllers');
    plugin.endpoints = [];
    bridge.update();
    assert.equal(bridge.getOutputs().size, 0);
    assert.equal(plugin.reports.at(-1), 0);
    plugin.endpoints = [{...endpoint}];
    assert.notEqual(Array.from(bridge.getOutputs())[0], original);
});

test('coordinator timer starts explicitly, cannot be duplicated, and stops cleanly', t => {
    t.mock.timers.enable({apis: ['setInterval']});
    const bridge = new Bridge([]);
    let updates = 0;
    bridge.update = () => { updates++; };
    t.mock.timers.tick(1000);
    assert.equal(updates, 0);
    bridge.start();
    t.mock.timers.tick(100);
    assert.equal(updates, 1);
    bridge.start();
    t.mock.timers.tick(100);
    assert.equal(updates, 2);
    bridge.stop();
    t.mock.timers.tick(1000);
    assert.equal(updates, 2);
});

test('fresh frames preserve movement history while distinct handles with identical private IDs remain independent', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = {
        id: 'same-private-id',
        type: 'rotate',
        lastLevel: 0,
        setLevel(value: number) { this.lastLevel = value; },
    };
    const other = {...endpoint};
    class Integration extends Plugin {
        readonly id = 'history';
        value = 0.5;
        override getOutputs() {
            return [endpoint, other].map((output, index) => ({
                output,
                inputs: [{
                    inputs: [{
                        id: 'sample',
                        kind: 'position' as const,
                        value: index === 0 ? this.value : 0.5,
                        movement: true,
                    }],
                    modifiers: [],
                }],
                settings: {},
            }));
        }
    }
    const plugin = new Integration();
    const bridge = new Bridge([plugin]);
    bridge.update();
    t.mock.timers.tick(100);
    plugin.value = 0.25;
    bridge.update();
    assert.equal(endpoint.lastLevel, -0.5);
    assert.equal(other.lastLevel, 0);
    assert.equal(bridge.getOutputs().size, 2);
});
