import {Container, Service, Token} from 'typedi';
import type {Constructable, ContainerInstance} from 'typedi';
import type {LinkInputResolver, ResolveLinks} from './linkInputs';
import type {OutputFrame} from '../OutputFrame';
import type {OutputConfig} from '../../common/application/configTypes';
import type {SettingsStatePayload} from '../../common/application/ipcContract';
import type OutputController from '../OutputController';
import type {PluginContext} from './PluginContext';

export abstract class Plugin {
    abstract readonly id: string;
    static readonly token = new Token<Plugin>('Plugin');
    async start(context: PluginContext): Promise<void> {}
    async settingsState(outputs: readonly OutputController[]): Promise<Partial<SettingsStatePayload>> { return {}; }
    snapshot(): LinkInputResolver | undefined { return undefined; }
    getOutputs(resolve: ResolveLinks): Iterable<OutputFrame> { return []; }
    getOutputConfigs(): Iterable<OutputConfig> { return []; }
    afterUpdate(outputLevel: number): void {}
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
