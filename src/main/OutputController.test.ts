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

test('unknown output control modes contribute nothing and never send commands, even when disabled', () => {
    const commands: number[] = [];
    const endpoint = {
        id: 'future',
        type: 'future-control',
        lastLevel: 0,
        setLevel(value: number) { commands.push(value); },
    };
    const controller = new OutputController(endpoint);
    for (const enabled of [true, false]) {
        controller.update(input(1), {enabled});
        assert.equal(controller.getCurrentLevel(), 0);
        assert.deepEqual(controller.getLastLinkValues(), [0]);
    }
    assert.deepEqual(commands, []);
    endpoint.type = 'vibrate';
    controller.update(input(0.4), {});
    assert.deepEqual(commands, [0.4]);
});

test('controller drives a generic intensity endpoint and reports commanded state', () => {
    const endpoint = new RecordingOutput('vibrate');
    const controller = new OutputController(endpoint);
    controller.update(input(0.6), {});
    assert.equal(endpoint.lastLevel, 0.6);
    assert.equal(controller.getCurrentLevel(), 0.6);
    assert.deepEqual(controller.getLastLinkValues(), [0.6]);
});

test('controller sends signed rotation derived from motion to a generic endpoint', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = new RecordingOutput('rotate');
    const controller = new OutputController(endpoint);
    const links: ResolvedLink[] = [{inputs: [{id: 'input', value: 0.5, kind: 'position', movement: true}], modifiers: []}];
    controller.update(links, {});
    t.mock.timers.tick(100);
    links[0] = {...links[0]!, inputs: [{id: 'input', value: 0.25, kind: 'position', movement: true}]};
    controller.update(links, {});
    assert.equal(endpoint.lastLevel, -0.5);
});

test('controller plans timed position commands and handles endpoint mode changes', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = new RecordingOutput('vibrate');
    const controller = new OutputController(endpoint);
    const config = {enabled: true};
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

test('disabled intensity and rotation devices stop while keeping link settings for reenable', () => {
    for (const type of ['vibrate', 'rotate'] as const) {
        const endpoint = new RecordingOutput(type);
        const controller = new OutputController(endpoint);
        const config = {enabled: true};
        controller.update(input(0.8), config);
        assert.equal(endpoint.lastLevel, 0.8);
        config.enabled = false;
        controller.update(input(0.8), config);
        assert.equal(endpoint.lastLevel, 0);
        assert.equal(controller.getCurrentLevel(), 0);
        assert.deepEqual(controller.getLastLinkValues(), [0]);
        config.enabled = true;
        controller.update(input(0.8), config);
        assert.equal(endpoint.lastLevel, 0.8);
    }
});

test('disabled linear devices do not receive position-zero or rest movements', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const endpoint = new RecordingOutput('linear');
    endpoint.lastLevel = 0.5;
    const controller = new OutputController(endpoint);
    for (let i = 0; i < 10; i++) {
        controller.update(input(1), {enabled: false});
        t.mock.timers.tick(1000);
    }
    assert.equal(endpoint.commands.length, 0);
    assert.equal(endpoint.lastLevel, 0.5);
    assert.equal(controller.getCurrentLevel(), 0);
});
