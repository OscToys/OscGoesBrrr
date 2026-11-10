import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Bridge from './bridge';
import {Plugin} from './plugins/Plugin';
import type {LinkInputResolver} from './sourceInputs';
import type {OutputEndpoint} from './OutputEndpoint';
import type ConfigService from './services/ConfigService';
import type {Config} from '../common/configTypes';

test('coordinator discovers plugin outputs, preserves controllers, and reports combined level', t => {
    t.mock.timers.enable({apis: ['setInterval']});
    const endpoint: OutputEndpoint & {lastLevel: number} = {
        id: 'fake',
        type: 'vibrate',
        lastLevel: 0,
        setLevel(value) { this.lastLevel = value; },
    };
    class Integration extends Plugin {
        endpoints: OutputEndpoint[] = [endpoint];
        reports: number[] = [];
        override snapshot(): LinkInputResolver {
            return () => [{id: 'sample', value: 0.6, kind: 'intensity'}];
        }
        override getOutputs() { return this.endpoints; }
        override afterUpdate(level: number) { this.reports.push(level); }
    }
    const plugin = new Integration();
    const config: Config = {
        version: 4,
        useIntifaceMdns: true,
        useOscQuery: true,
        oscProxy: [],
        outputs: [{id: endpoint.id, links: [{kind: 'constant', level: 0.6}]}],
    };
    const service = {
        getOutput: (id: string) => config.outputs.find(output => output.id === id),
        getCached: () => config,
    } as ConfigService;
    const bridge = new Bridge(service, [plugin]);
    const original = Array.from(bridge.getOutputs())[0];
    bridge.update();
    assert.equal(endpoint.lastLevel, 0.6);
    assert.equal(plugin.reports.at(-1), 0.6);
    assert.equal(Array.from(bridge.getOutputs())[0], original);
    plugin.endpoints = [];
    bridge.update();
    assert.equal(bridge.getOutputs().size, 0);
    assert.equal(plugin.reports.at(-1), 0);
    plugin.endpoints = [{...endpoint}];
    assert.notEqual(Array.from(bridge.getOutputs())[0], original);
});

test('coordinator timer starts explicitly, cannot be duplicated, and stops cleanly', t => {
    t.mock.timers.enable({apis: ['setInterval']});
    const bridge = new Bridge({} as ConfigService, []);
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
    bridge.stop();
});
