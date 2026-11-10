import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Container, InjectMany, Service} from 'typedi';
import {Plugin, PluginService} from './Plugin';
import AudioPlugin from '../../plugins/audio/main/AudioPlugin';
import ConstantPlugin from '../../plugins/constant/main/ConstantPlugin';
import type {LinkInputResolver} from '../sourceInputs';

@PluginService()
class ExtraPlugin extends Plugin {
    override snapshot(): LinkInputResolver {
        return () => undefined;
    }
}

@Service()
class PluginConsumer {
    constructor(
        readonly adapters: Plugin[],
        readonly audio: AudioPlugin,
    ) {}
}

// tsx does not emit constructor metadata; supply the metadata the application compiler emits.
Reflect.defineMetadata('design:paramtypes', [Array, AudioPlugin], PluginConsumer);
InjectMany(Plugin.token)(PluginConsumer, undefined, 0);

test('adapter collection automatically includes implementations and shares concrete singletons', () => {
    const consumer = Container.get(PluginConsumer);
    assert.ok(consumer.adapters.includes(Container.get(ExtraPlugin)));
    assert.ok(consumer.adapters.includes(Container.get(ConstantPlugin)));
    assert.ok(consumer.adapters.includes(consumer.audio));
    consumer.audio.receivedFft(0.4);
    const registeredAudio = consumer.adapters.find(adapter => adapter === consumer.audio)!;
    const value = registeredAudio.snapshot()?.({kind: 'systemAudio', mutators: []}, 0, false)?.[0]?.value;
    assert.equal(value, 0.4);
    const secondCollection = Container.getMany(Plugin.token);
    assert.deepEqual(secondCollection, consumer.adapters);
    assert.equal(secondCollection.find(adapter => adapter instanceof AudioPlugin), consumer.audio);
});
