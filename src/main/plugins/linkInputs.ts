import type {OutputLink} from '../../common/configTypes';
import type {ResolvedLink} from '../routing';

export type LinkInputResolver = (
    link: OutputLink,
    index: number,
    linear: boolean,
) => ResolvedLink | undefined;

export type ResolveLinks = (links: readonly OutputLink[], linear: boolean) => ResolvedLink[];

/** Only the owning plugin can interpret a link's kind and payload. */
export function collectLinkInputs(
    links: readonly OutputLink[],
    linear: boolean,
    resolvers: ReadonlyMap<string, LinkInputResolver>,
): ResolvedLink[] {
    return links.map((link, index): ResolvedLink => {
        const empty = {inputs: [], modifiers: []};
        if (link.enabled === false) return empty;
        const resolved = resolvers.get(link.plugin)?.(link, index, linear);
        if (!resolved) return empty;
        const inputs = resolved.inputs.map(input => ({
            ...input,
            id: JSON.stringify([link.plugin, index, input.id]),
        }));
        return {inputs, modifiers: resolved.modifiers};
    });
}
