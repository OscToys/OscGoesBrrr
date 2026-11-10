import {Service} from "typedi";
import type {PluginContext} from '../../../main/plugins/PluginContext';
import {poll} from '../../../main/plugins/poll';

@Service()
export default class VrcConfigCheck {
    oscEnabled?: boolean;
    selfInteractEnabled?: boolean;
    everyoneInteractEnabled?: boolean;
    loggingFull?: boolean;

    start(context: PluginContext): void {
        poll(context, 5000, () => this.check(), () => {});
    }

    private async check() {
        const reg = await import('native-reg');

        const vrChatKey = reg.openKey(
            reg.HKCU,
            'Software\\VRChat\\VRChat',
            reg.Access.READ);
        if (!vrChatKey) return;

        try {
            const subKeys = reg.enumValueNames(vrChatKey);

            const getValue = (subKey: string) => {
                const searchLower = subKey.toLowerCase();
                const realKey = subKeys.find(key => {
                    const lower = key.toLowerCase();
                    return lower == searchLower || lower.startsWith(searchLower+"_h")
                });
                if (!realKey) return null;
                return reg.queryValue(vrChatKey, realKey);
            }

            this.oscEnabled = getValue('UI.Settings.Osc') == 1;
            this.selfInteractEnabled = getValue('VRC_AV_INTERACT_SELF') == 1;
            this.everyoneInteractEnabled = getValue('VRC_AV_INTERACT_LEVEL') == 2;
            this.loggingFull = getValue('LOGGING_ENABLED') == 1;
        } finally {
            reg.closeKey(vrChatKey);
        }
    }
}
