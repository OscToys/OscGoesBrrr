import {Container, Service, Token} from 'typedi';
import type {Constructable, ContainerInstance} from 'typedi';
import type {LinkInputResolver} from '../sourceInputs';
import type {OutputEndpoint} from '../OutputEndpoint';
import type {Config} from '../../common/configTypes';
import type {SettingsStatePayload} from '../../common/ipcContract';
import type OutputController from '../OutputController';
import type {PluginContext} from './PluginContext';

export abstract class Plugin {
    static readonly token = new Token<Plugin>('Plugin');
    async start(context: PluginContext): Promise<void> {}
    async settingsState(outputs: readonly OutputController[]): Promise<Partial<SettingsStatePayload>> { return {}; }
    snapshot(): LinkInputResolver | undefined { return undefined; }
    getOutputs(): Iterable<OutputEndpoint> { return []; }
    afterUpdate(outputLevel: number, config: Readonly<Config>): void {}
}

/** Register a concrete singleton and expose that same instance in the plugin collection. */
export function PluginService() {
    return <T extends Plugin>(target: Constructable<T>) => {
        Service()(target);
        Container.set({
            id: Plugin.token,
            multiple: true,
            factory: (container: ContainerInstance) => container.get(target),
        });
    };
}
