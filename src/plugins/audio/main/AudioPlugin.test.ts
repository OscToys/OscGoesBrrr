import assert from 'node:assert/strict';
import {test} from 'node:test';
import AudioPlugin from './AudioPlugin';
import type {OutputLink} from '../../../common/configTypes';
import PluginRuntime from '../../../main/plugins/PluginRuntime';
import {createPluginHost} from '../../../main/plugins/testHost';

const audioLink: OutputLink = {kind: 'systemAudio', mutators: []};

test('audio expires exactly one second after receipt and resumes on a new sample', t => {
    t.mock.timers.enable({apis: ['Date'], now: 1000});
    const audio = new AudioPlugin();
    const read = () => audio.snapshot()(audioLink, 2, false)?.[0];
    assert.deepEqual(read(), {id: '2', value: 0, kind: 'intensity'});
    audio.receivedFft(0.6);
    const frozen = audio.snapshot();
    t.mock.timers.tick(999);
    assert.equal(read()?.value, 0.6);
    t.mock.timers.tick(1);
    assert.equal(read()?.value, 0);
    assert.equal(frozen(audioLink, 2, false)?.[0]?.value, 0.6);
    audio.receivedFft(0.3);
    assert.equal(read()?.value, 0.3);
    audio.receivedFft(0);
    assert.equal(read()?.value, 0);
});

test('audio resolver declines other link types and excludes linear outputs', () => {
    const audio = new AudioPlugin();
    audio.receivedFft(1);
    const resolve = audio.snapshot();
    assert.deepEqual(resolve(audioLink, 0, true), []);
    assert.equal(resolve({kind: 'constant', level: 1}, 0, false), undefined);
});

test('audio capture follows host output snapshots and releases its timer and IPC on shutdown', async t => {
    t.mock.timers.enable({apis: ['setInterval', 'Date'], now: 1000});
    const audio = new AudioPlugin();
    const {host, outputs, events, handlers, invoke} = createPluginHost();
    const runtime = new PluginRuntime([audio], host);
    await runtime.start();
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:stop');
    outputs.push({id: 'test', config: {id: 'test', links: [audioLink]}});
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1), 'fft:start');
    invoke('fft:status', 0.7);
    assert.equal(audio.snapshot()(audioLink, 0, false)?.[0]?.value, 0.7);
    for (const invalid of [-1, 2, NaN, Infinity]) invoke('fft:status', invalid);
    assert.equal(audio.snapshot()(audioLink, 0, false)?.[0]?.value, 0.7);
    outputs[0]!.config!.links = [];
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
