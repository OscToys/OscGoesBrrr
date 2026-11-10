import type {Draft} from "immer";
import type {Config} from "../../common/configTypes";
import type {NormalizeSource} from "./AbstractJsonStateService";

import {normalizePluginConfig} from '../../common/plugins/configuration';

export {normalizeAddress} from '../../common/normalizeAddress';

export function normalizeConfigDraft(draft: Draft<Config>, source: NormalizeSource): void {
    normalizePluginConfig(draft, source);

    for (const output of draft.outputs) {
        if (!output.linear) continue;
        const linearEntries = Object.entries(output.linear).filter(([, value]) => value !== undefined);
        if (linearEntries.length === 0) {
            delete output.linear;
        }
    }
}
