import type {OutputLink} from '../common/configTypes';
import type {InputSample, ResolvedLink} from './routing';

export type LinkInputResolver = (
    link: OutputLink,
    index: number,
    linear: boolean,
) => readonly InputSample[] | undefined;

/** Dispatch each link to the first adapter that recognizes it. */
export function collectLinkInputs(
    links: readonly OutputLink[],
    linear: boolean,
    resolvers: readonly LinkInputResolver[],
): ResolvedLink[] {
    return links.map((link, index): ResolvedLink => {
        const modifiers = 'mutators' in link ? link.mutators : [];
        const empty = {inputs: [], modifiers};
        for (const resolve of resolvers) {
            const inputs = resolve(link, index, linear);
            if (inputs !== undefined) return {inputs, modifiers};
        }
        return empty;
    });
}
