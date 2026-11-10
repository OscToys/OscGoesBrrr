import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateRoutes, type ResolvedLink} from './routing';

test('routing distinguishes speed from level derivatives and does not mutate caller history', () => {
    const history = new Map([['depth', 0.5], ['removed', 1]]);
    const links: ResolvedLink[] = [{
        inputs: [{id: 'depth', value: 0.25, kind: 'position'}],
        modifiers: [{kind: 'motionBased'}],
    }, {
        inputs: [{id: 'touch', value: 0.6, kind: 'speed'}],
        modifiers: [{kind: 'motionBased'}, {kind: 'deadZone', level: 0.2}],
    }];
    const first = evaluateRoutes(links, history, 100, true);
    assert.equal(first.links[0]?.output, 0.5);
    assert.equal(first.links[0]?.backward, true);
    assert.ok(Math.abs(first.links[1]!.output - 0.5) < 1e-9);
    assert.equal(history.get('depth'), 0.5);
    assert.equal(first.nextInputs.has('removed'), false);
    const second = evaluateRoutes(links, first.nextInputs, 100, true);
    assert.equal(second.links[0]?.output, 0);
    assert.ok(Math.abs(second.links[1]!.output - 0.5) < 1e-9);
    assert.deepEqual(evaluateRoutes(links, history, 100, true), first);
});

test('routing preserves strongest-input direction, disables differentiation for position, and clamps only final output', () => {
    const links: ResolvedLink[] = [{
        inputs: [{id: 'a', value: 0, kind: 'position'}, {id: 'b', value: 0.5, kind: 'position'}],
        modifiers: [{kind: 'motionBased'}, {kind: 'scale', scale: 2}],
    }];
    const history = new Map([['a', 1], ['b', 0.5]]);
    const motion = evaluateRoutes(links, history, 100, true);
    assert.deepEqual(motion.links, [{output: 4, backward: true}]);
    assert.deepEqual(motion.output, {output: 1, backward: true});
    assert.deepEqual(evaluateRoutes(links, history, 100, false).output, {output: 1, backward: false});
    assert.deepEqual(evaluateRoutes([], history, 0, true).output, {output: 0, backward: false});
});
