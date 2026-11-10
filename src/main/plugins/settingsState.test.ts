import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Plugin} from './Plugin';
import {collectPluginSettings} from './settingsState';
import type OutputController from '../OutputController';
import type {OutputDeviceInfo} from '../../common/ipcContract';

function outputInfo(id: string): OutputDeviceInfo {
    return {
        id,
        name: id,
        connected: true,
        showLinearActuatorOptions: false,
        supportsLinearPreference: false,
        currentLevel: 0,
        lastLinkValues: [],
    };
}

test('plugin settings preserve all output contributions and pass the same controller snapshot', async () => {
    const outputs: OutputController[] = [];
    class FakePlugin extends Plugin {
        constructor(private readonly id: string) { super(); }
        override async settingsState(snapshot: readonly OutputController[]) {
            assert.equal(snapshot, outputs);
            return {outputs: [outputInfo(this.id)]};
        }
    }
    const state = await collectPluginSettings([new FakePlugin('a'), new FakePlugin('b')], outputs);
    assert.deepEqual(state.outputs.map(output => output.id), ['a', 'b']);
    assert.deepEqual(await collectPluginSettings([], outputs), {outputs: []});
});

test('plugin settings failures propagate instead of publishing incomplete state', async () => {
    class FailingPlugin extends Plugin {
        override async settingsState(): Promise<never> { throw new Error('Invalid saved state'); }
    }
    await assert.rejects(collectPluginSettings([new FailingPlugin()], []), /Invalid saved state/);
});
