import type {Draft} from 'immer';
import type {OutputConfig, OutputLink, PluginConfig} from './configTypes';

export interface PluginConfiguration {
    id: string;
    order?: number;
    defaults: PluginConfig;
    defaultLinks?(): OutputLink[];
    normalize?(draft: Draft<PluginConfig>, source: 'load' | 'mutate'): void;
    normalizeOutput?(output: Draft<OutputConfig>): void;
    upgrade?(settings: PluginConfig): void;
    /** Return the upgraded record, or null to remove it. Links use their source owner's version. */
    upgradeOutput?(output: OutputConfig, fromVersion: number): OutputConfig | null;
    upgradeLink?(link: OutputLink, fromVersion: number): OutputLink | null;
    // One import from the committed, pre-plugin JSON format. Not TXT or intermediate working-tree formats.
    migrateSettings?(legacy: Record<string, unknown>, version: number): PluginConfig;
    migrateOutput?(legacy: Record<string, unknown>, version: number): OutputConfig | null | undefined;
    migrateLink?(legacy: Record<string, unknown>, version: number): OutputLink | undefined;
}

const configurations = new Map<string, PluginConfiguration>();

export function registerPluginConfiguration(configuration: PluginConfiguration): () => void {
    if (!configuration.id || configurations.has(configuration.id)) throw new Error(`Invalid or duplicate plugin configuration: ${configuration.id}`);
    configurations.set(configuration.id, configuration);
    return () => {
        if (configurations.get(configuration.id) === configuration) configurations.delete(configuration.id);
    };
}

export function getPluginConfigurations(): readonly PluginConfiguration[] {
    return Array.from(configurations.values()).sort((a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
