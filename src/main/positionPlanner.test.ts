import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planPosition} from './positionPlanner';

test('position planner accelerates toward its target and respects velocity limits', () => {
    const state = Object.freeze({velocity: 0, lastActiveAt: 0});
    const first = planPosition(0.1, 0.2, 100, 1000, {maxa: 2, maxv: 0.3, durationMult: 2}, state);
    assert.equal(first.nextState.velocity, 0.2);
    assert.ok(Math.abs(first.position - 0.22) < 1e-9);
    assert.equal(first.duration, 200);
    const second = planPosition(0.1, first.position, 100, 1100, {maxa: 2, maxv: 0.3}, first.nextState);
    assert.equal(second.nextState.velocity, 0.3);
    assert.deepEqual(state, {velocity: 0, lastActiveAt: 0});
});

test('position planner reaches nearby targets without overshooting and remains there', () => {
    const first = planPosition(0.5, 0.49, 100, 1000, undefined, {velocity: 0, lastActiveAt: 0});
    assert.equal(first.position, 0.5);
    const second = planPosition(0.5, first.position, 100, 1100, undefined, first.nextState);
    assert.equal(second.position, 0.5);
    assert.equal(second.nextState.velocity, 0);
});

test('position planner applies configured range, then returns to rest after inactivity', () => {
    const settings = {min: 0.2, max: 0.8, restingPos: 0.1, restingTime: 3};
    const state = {velocity: 0, lastActiveAt: 1000};
    assert.equal(planPosition(0.5, 0.5, 100, 2000, settings, state).position, 0.5);
    assert.ok(planPosition(0, 0.5, 100, 4000, settings, state).position > 0.5);
    const resting = planPosition(0, 0.5, 100, 4001, settings, state);
    assert.ok(resting.position < 0.5);
    assert.equal(resting.nextState.lastActiveAt, 1000);
});

test('zero elapsed time holds position without dividing by zero', () => {
    const plan = planPosition(0.5, 0.5, 0, 1000, undefined, {velocity: 1, lastActiveAt: 0});
    assert.equal(plan.position, 0.5);
    assert.equal(plan.nextState.velocity, 1);
    assert.equal(plan.duration, 0);
});
