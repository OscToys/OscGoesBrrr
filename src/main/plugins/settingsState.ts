import type {Plugin} from './Plugin';
import type OutputController from '../OutputController';
import type {OutputDeviceInfo, SettingsStatePayload} from '../../common/application/ipcContract';

export async function collectPluginSettings(
    plugins: readonly Plugin[],
    outputs: readonly OutputController[],
): Promise<Partial<SettingsStatePayload> & {outputs: OutputDeviceInfo[]}> {
    const contributions = await Promise.all(plugins.map(plugin => plugin.settingsState(outputs)));
    return Object.assign(
        {},
        ...contributions,
        {outputs: contributions.flatMap(state => state.outputs ?? [])},
    );
}
