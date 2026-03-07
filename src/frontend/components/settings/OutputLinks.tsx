import React, {useCallback, useMemo, useState} from 'react';
import {produce} from 'immer';
import {OutputLink, OutputLinkKind} from '../../../common/configTypes';
import {Menu, MenuItem, Stack, Typography} from '@mui/material';
import {pushItem} from "../../../common/arrayDraft";
import AddIcon from "@mui/icons-material/Add";
import OutputLinkEditor from "./OutputLinkEditor";
import MyAccordion from "../util/MyAccordion";
import {type Atom, type PrimitiveAtom, useAtomValue, useSetAtom} from "jotai";
import {splitAtom} from "jotai/utils";

interface Props {
    linksAtom: PrimitiveAtom<OutputLink[]>;
    linkLevelsAtom: Atom<number[]>;
}

const LINK_OPTIONS: {kind: OutputLinkKind, label: string}[] = [
    {kind: 'vrchat.sps.plug', label: 'SPS Plugs'},
    {kind: 'vrchat.sps.socket', label: 'SPS Sockets'},
    {kind: 'vrchat.sps.touch', label: 'SPS Touch Zones'},
    {kind: 'systemAudio', label: 'System Audio (Unfinished Alpha)'},
    {kind: 'constant', label: 'Constant'},
    {kind: 'vrchat.avatarParameter', label: 'VRC Avatar Parameter'},
];
const LINK_OPTION_MAP = new Map(LINK_OPTIONS.map(option => [option.kind, option]));

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
    const buildLink = (kind: OutputLinkKind): OutputLink => {
        switch (kind) {
            case 'vrchat.sps.plug':
                return {kind, filter: {include: [], exclude: []}, ownHands: false, otherHands: true, mySockets: false, otherSockets: true, otherPlugs: true, mutators: []};
            case 'vrchat.sps.socket':
                return {kind, filter: {include: [], exclude: []}, ownHands: false, otherHands: true, myPlugs: false, otherPlugs: true, otherSockets: true, mutators: []};
            case 'vrchat.sps.touch':
                return {kind, filter: {include: [], exclude: []}, ownHands: false, otherHands: true, mutators: []};
            case 'vrchat.avatarParameter':
                return {kind, parameter: '', mutators: []};
            case 'systemAudio':
                return {kind, mutators: []};
            case 'constant':
                return {kind, level: 0.1};
        }
    };

    const addLink = (kind: OutputLinkKind) => {
        setLinks((prev) => produce(prev, (draft) => pushItem(draft, buildLink(kind))));
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
                        labelMap={LINK_OPTION_MAP}
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
                    <Stack direction="row" spacing={1} alignItems="center">
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
                {LINK_OPTIONS.map(opt => (
                    <MenuItem key={opt.kind} onClick={() => addLink(opt.kind)}>
                        {opt.label}
                    </MenuItem>
                ))}
            </Menu>
        </Stack>
    );
}

export default React.memo(OutputLinks);
