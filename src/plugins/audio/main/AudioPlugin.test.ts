import assert from 'node:assert/strict';
import {test} from 'node:test';
import AudioPlugin from './AudioPlugin';
import type {OutputConfig, OutputLink} from '../../../common/application/configTypes';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';

const audioLink: OutputLink = {plugin: 'audio', kind: 'systemAudio', mutators: []};

test('audio expires exactly one second after receipt and resumes on a new sample', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const audio = new AudioPlugin();
    const read = () => audio.snapshot()(audioLink, 2, false)?.inputs[0];
    assert.deepEqual(read(), {id: '2', value: 0, kind: 'intensity'});
    audio.receivedFft(0.6);
    const frozen = audio.snapshot();
    t.mock.timers.tick(999);
    assert.equal(read()?.value, 0.6);
    t.mock.timers.tick(1);
    assert.equal(read()?.value, 0);
    assert.equal(frozen(audioLink, 2, false)?.inputs[0]?.value, 0.6);
    audio.receivedFft(0.3);
    assert.equal(read()?.value, 0.3);
    audio.receivedFft(0);
    assert.equal(read()?.value, 0);
});

test('audio resolver declines other link types and excludes linear outputs', () => {
    const audio = new AudioPlugin();
    audio.receivedFft(1);
    const resolve = audio.snapshot();
    assert.deepEqual(resolve(audioLink, 0, true)?.inputs, []);
    assert.equal(resolve({plugin: 'constant', kind: 'constant', level: 1}, 0, false), undefined);
});

test('audio capture follows host output snapshots and releases its timer and IPC on shutdown', async t => {
    t.mock.timers.enable({apis: ['setInterval', 'Date'], now: 1000});
    const audio = new AudioPlugin();
    const {host, outputs, events, handlers, invoke} = createPluginHost();
    const runtime = new PluginRuntime([audio], host);
    await runtime.start();
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    const outputConfig: OutputConfig = {plugin: 'intiface', id: 'test', links: [audioLink]};
    outputs.push({id: 'test', config: outputConfig});
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:start');
    outputConfig.links = [{...audioLink, plugin: 'missing'}];
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    outputConfig.links = [audioLink];
    outputConfig.enabled = false;
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    outputConfig.enabled = true;
    outputConfig.links = [{...audioLink, enabled: false}];
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    outputConfig.links = [audioLink];
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:start');
    invoke('fft:status', 0.7);
    assert.equal(audio.snapshot()(audioLink, 0, false)?.inputs[0]?.value, 0.7);
    for (const invalid of [-1, 2, NaN, Infinity]) invoke('fft:status', invalid);
    assert.equal(audio.snapshot()(audioLink, 0, false)?.inputs[0]?.value, 0.7);
    outputConfig.links = [];
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    outputs.length = 0;
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    runtime.stop();
    assert.equal(handlers.size, 0);
    assert.equal(events.at(-1), 'fft:stop');
    const count = events.length;
    t.mock.timers.tick(1000);
    assert.equal(events.length, count);
});
