import assert from 'node:assert/strict';
import {test} from 'node:test';
import OutputController from './OutputController';
import type {OutputEndpoint, OutputControlType} from './OutputEndpoint';
import type {ResolvedLink} from './routing';

class RecordingOutput implements OutputEndpoint {
    readonly id = 'test-output';
    lastLevel = 0;
    readonly commands: {value: number; duration?: number}[] = [];

    constructor(public type: OutputControlType) {}

    setLevel(value: number, duration?: number) {
        this.commands.push({value, duration});
        this.lastLevel = value;
    }
}

function input(value: number): ResolvedLink[] {
    return [{inputs: [{id: 'input', value, kind: 'position'}], modifiers: []}];
}

test('controller drives a generic intensity endpoint and reports commanded state', () => {
    const endpoint = new RecordingOutput('vibrate');
    const controller = new OutputController(endpoint);
    controller.update(input(0.6), {id: endpoint.id, links: []});
    assert.equal(endpoint.lastLevel, 0.6);
    assert.equal(controller.getCurrentLevel(), 0.6);
    assert.deepEqual(controller.getLastLinkValues(), [0.6]);
});

test('controller sends signed rotation derived from motion to a generic endpoint', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = new RecordingOutput('rotate');
    const controller = new OutputController(endpoint);
    const links = input(0.5);
    links[0]!.modifiers = [{kind: 'motionBased'}];
    controller.update(links, {id: endpoint.id, links: []});
    t.mock.timers.tick(100);
    links[0] = {...links[0]!, inputs: [{id: 'input', value: 0.25, kind: 'position'}]};
    controller.update(links, {id: endpoint.id, links: []});
    assert.equal(endpoint.lastLevel, -0.5);
});

test('controller plans timed position commands and handles endpoint mode changes', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = new RecordingOutput('vibrate');
    const controller = new OutputController(endpoint);
    const config = {id: endpoint.id, links: []};
    controller.update(input(0.49), config);
    endpoint.type = 'linear';
    t.mock.timers.tick(100);
    controller.update(input(0.5), config);
    assert.deepEqual(endpoint.commands.at(-1), {value: 0.5, duration: 100});
    const count = endpoint.commands.length;
    t.mock.timers.tick(100);
    controller.update(input(0.5), config);
    assert.equal(endpoint.commands.length, count, 'Stable position does not send another command');
    endpoint.type = 'vibrate';
    t.mock.timers.tick(100);
    controller.update(input(0.8), config);
    assert.equal(endpoint.lastLevel, 0.8);
});
