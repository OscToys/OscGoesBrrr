export default class VrcConfigCheck {
    oscEnabled?: boolean;
    selfInteractEnabled?: boolean;
    everyoneInteractEnabled?: boolean;

    async start() {
        const reg = await import('native-reg');
        while (true) {
            try { await this.check(); } catch {}
            console.log(`OSC=${this.oscEnabled} SELF=${this.selfInteractEnabled} EVERYONE=${this.everyoneInteractEnabled}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    async check() {
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
        } finally {
            reg.closeKey(vrChatKey);
        }
    }
}
