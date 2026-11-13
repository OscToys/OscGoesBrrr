import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import OutputController from '../../../main/OutputController';
import {IntifaceOutput} from './Intiface';
import type Intiface from './Intiface';
import {selectIntifaceOutput, supportsLinearPreference, type IntifaceFeatureInformation, type IntifaceDeviceFeatureSelection} from './IntifaceProtocol';

test('linear preference is offered only for oscillation plus a positioning output', () => {
    for (const Output of [{Oscillate: {}}, {Position: {}}, {Vibrate: {}, Position: {}}, {}]) {
        const feature = {FeatureIndex: 0, FeatureDescription: 'Test', Output};
        assert.equal(supportsLinearPreference(feature), false);
        assert.equal(selectIntifaceOutput(feature, true), selectIntifaceOutput(feature));
    }
    const feature = {FeatureIndex: 0, FeatureDescription: 'Test', Output: {Oscillate: {}, Position: {}, HwPositionWithDuration: {}}};
    assert.equal(supportsLinearPreference(feature), true);
    assert.equal(selectIntifaceOutput(feature), 'Oscillate');
    assert.equal(selectIntifaceOutput(feature, true), 'HwPositionWithDuration');
    assert.equal(selectIntifaceOutput({FeatureIndex: 0, FeatureDescription: 'Test', Output: {Oscillate: {}, Position: {}}}, true), 'Position');
});

for (const position of ['Position', 'HwPositionWithDuration'] as const) {
    test(`switching between oscillation and ${position} updates commands and ranges immediately`, () => {
        const feature: IntifaceFeatureInformation = {
            FeatureIndex: 0,
            FeatureDescription: 'Test',
            Output: {Oscillate: {Value: [0, 20]}, [position]: {Value: [0, 100]}},
        };
        const selection: IntifaceDeviceFeatureSelection = {
            device: {DeviceIndex: 1, DeviceName: 'Test', DeviceFeatures: {'0': feature}},
            feature, selectedOutput: 'Oscillate',
        };
        const sent: unknown[] = [];
        const parent = {sendAndForget: (message: unknown) => sent.push(message)} as unknown as Intiface;
        const output = new IntifaceOutput('Test', parent, Object.freeze(selection));
        const command = (Command: unknown) => ({type: 'OutputCmd', DeviceIndex: 1, FeatureIndex: 0, Command});
        output.setLevel(0.5);
        assert.deepEqual(sent.pop(), command({Oscillate: {Value: 10}}));
        output.setPreferLinear(true);
        assert.deepEqual(sent.pop(), command({Oscillate: {Value: 0}}));
        assert.equal(output.type, 'linear');
        assert.equal(output.disableInterpolation, position === 'Position');
        output.setLevel(0.5, 150);
        assert.deepEqual(sent.pop(), command({[position]: position === 'Position'
            ? {Value: 50} : {Value: 50, Duration: 150}}));
        output.setPreferLinear(false);
        assert.equal(output.type, 'vibrate');
        assert.equal(output.disableInterpolation, false);
        output.setLevel(0.5);
        assert.deepEqual(sent.pop(), command({Oscillate: {Value: 10}}));
    });
}

for (const selectedOutput of ['Position', 'HwPositionWithDuration'] as const) {
    test(`${selectedOutput} keeps linear routing with the appropriate interpolation policy`, () => {
        const feature: IntifaceFeatureInformation = {
            FeatureIndex: 0,
            FeatureDescription: 'Test',
            Output: {[selectedOutput]: {Value: [0, 100]}},
        };
        const sent: unknown[] = [];
        const parent = {sendAndForget: (message: unknown) => sent.push(message)} as unknown as Intiface;
        const output = new IntifaceOutput('Test', parent, {
            device: {DeviceIndex: 1, DeviceName: 'Test', DeviceFeatures: {'0': feature}},
            feature,
            selectedOutput,
        });
        const controller = new OutputController(output);
        controller.update(
            [{inputs: [{id: 'depth', kind: 'position', value: 0.2, movement: true}], modifiers: []}],
            {linear: {maxv: 0.01, maxa: 0.01}},
        );
        assert.equal(output.type, 'linear');
        assert.deepEqual(controller.getLastLinkValues(), [0.2]);
        if (selectedOutput === 'Position') {
            assert.equal(output.lastLevel, 0.8);
            assert.deepEqual(sent, [{
                type: 'OutputCmd',
                DeviceIndex: 1,
                FeatureIndex: 0,
                Command: {Position: {Value: 80}},
            }]);
        } else {
            assert.ok(output.lastLevel > 0 && output.lastLevel < 0.01);
        }
    });
}
