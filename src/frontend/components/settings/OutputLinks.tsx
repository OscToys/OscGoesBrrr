import React, {useCallback, useMemo, useState} from 'react';
import {produce} from 'immer';
import {OutputLink} from '../../../common/application/configTypes';
import {Menu, MenuItem, Stack, Typography} from '@mui/material';
import {pushItem} from "../../../common/arrayDraft";
import {Add as AddIcon} from "@mui/icons-material";
import OutputLinkEditor from "./OutputLinkEditor";
import MyAccordion from "../util/MyAccordion";
import {type Atom, type PrimitiveAtom, useAtomValue, useSetAtom} from "jotai";
import {splitAtom} from "jotai/utils";

interface Props {
    linksAtom: PrimitiveAtom<OutputLink[]>;
    linkLevelsAtom: Atom<number[]>;
}

import {linkDefinitions} from '../../plugins/plugins';
import type {LinkDefinition} from '../../plugins/Plugin';

function OutputLinks({linksAtom, linkLevelsAtom}: Props) {
    const [addLinkMenuAnchor, setAddLinkMenuAnchor] = useState<HTMLElement | null>(null);
    const linkAtomsAtom = useMemo(
        () => splitAtom(linksAtom),
        [linksAtom],
    );
    const setLinks = useSetAtom(linksAtom);
    const linkAtoms = useAtomValue(linkAtomsAtom);
    const linkLevels = useAtomValue(linkLevelsAtom);
    const dispatchLinkAtoms = useSetAtom(linkAtomsAtom);
    const removeLink = useCallback((linkAtom: PrimitiveAtom<OutputLink>) => {
        dispatchLinkAtoms({type: 'remove', atom: linkAtom});
    }, [dispatchLinkAtoms]);
    const addLink = (definition: LinkDefinition) => {
        setLinks((prev) => produce(prev, (draft) => pushItem(draft, definition.create())));
        setAddLinkMenuAnchor(null);
    };

    return (
        <Stack spacing={0}>
            {linkAtoms.map((linkAtom, index) => {
                return (
                    <OutputLinkEditor
                        key={linkAtom.toString()}
                        linkAtom={linkAtom}
                        activeLevel={linkLevels[index] ?? 0}
                        removeLink={removeLink}
                    />
                );
            })}
            <MyAccordion
                expanded={false}
                onChange={() => {}}
                onClick={(e) => setAddLinkMenuAnchor(e.currentTarget as HTMLElement)}
                sx={{
                    bgcolor: 'action.hover',
                }}
                summary={
                    <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                        <AddIcon fontSize="small" sx={{color: 'success.main'}} />
                        <Typography variant="subtitle2">Link To...</Typography>
                    </Stack>
                }
            />
            <Menu
                anchorEl={addLinkMenuAnchor}
                open={addLinkMenuAnchor !== null}
                onClose={() => setAddLinkMenuAnchor(null)}
            >
                {linkDefinitions.map(opt => (
                    <MenuItem key={JSON.stringify([opt.plugin, opt.kind])} onClick={() => addLink(opt)}>
                        {opt.label}
                    </MenuItem>
                ))}
            </Menu>
        </Stack>
    );
}

export default React.memo(OutputLinks);
