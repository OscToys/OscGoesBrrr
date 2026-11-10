import assert from 'node:assert/strict';
import {test} from 'node:test';
import {produce} from 'immer';
import {recordDeviceHistory, type BackendData} from './backendDataTypes';
import type {PluginDeviceHistoryData} from '../plugins/deviceHistory';

function record(index: number): PluginDeviceHistoryData {
    return {
        intiface: {
            device: {DeviceIndex: index, DeviceName: 'Test', DeviceFeatures: {}},
            feature: {FeatureIndex: 0, FeatureDescription: 'Test'},
            selectedOutput: 'Vibrate',
        },
    };
}

test('shared device history preserves the existing file shape and timestamps on updates', () => {
    const initial: BackendData = {version: 1, deviceHistory: {}};
    const first = produce(initial, draft => recordDeviceHistory(draft.deviceHistory, 'intiface.0.0', record(0), 100));
    assert.deepEqual(first, {
        version: 1,
        deviceHistory: {
            'intiface.0.0': {...record(0), firstSeen: 100, lastSeen: 100},
        },
    });
    const updated = produce(first, draft => recordDeviceHistory(draft.deviceHistory, 'intiface.0.0', record(1), 200));
    assert.deepEqual(updated.deviceHistory['intiface.0.0'], {
        ...record(1),
        firstSeen: 100,
        lastSeen: 200,
    });
    assert.equal(first.deviceHistory['intiface.0.0']!.lastSeen, 100);
});

test('shared device history treats IDs as opaque keys and preserves other records', () => {
    const original: BackendData = {
        version: 1,
        deviceHistory: {
            'existing.device': {...record(0), firstSeen: 1, lastSeen: 5},
        },
    };
    const updated = produce(original, draft => recordDeviceHistory(draft.deviceHistory, 'new.device', record(1), 200));
    assert.equal(updated.deviceHistory['existing.device'], original.deviceHistory['existing.device']);
    assert.equal(updated.deviceHistory['new.device']!.firstSeen, 200);
    assert.deepEqual(Object.keys(updated.deviceHistory), ['existing.device', 'new.device']);
});
