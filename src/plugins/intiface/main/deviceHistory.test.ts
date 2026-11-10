import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isIntifaceDeviceHistory, type IntifaceDeviceHistoryData} from './deviceHistory';

test('Intiface history consumers select their namespace without claiming other device records', () => {
    const payload: IntifaceDeviceHistoryData = {
        intiface: {
            device: {DeviceIndex: 0, DeviceName: 'Test', DeviceFeatures: {}},
            feature: {FeatureIndex: 0, FeatureDescription: 'Test'},
            selectedOutput: 'Vibrate',
        },
    };
    const item = {...payload, firstSeen: 1, lastSeen: 2};
    assert.equal(isIntifaceDeviceHistory('intiface.0.0', item), true);
    assert.equal(isIntifaceDeviceHistory('other.0.0', item), false);
    assert.equal(isIntifaceDeviceHistory('notintiface.0.0', item), false);
});
