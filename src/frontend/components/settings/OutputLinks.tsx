import React, {useState} from 'react';
import {produce} from 'immer';
import {OutputLink, OutputLinkKind} from '../../../common/configTypes';
import {Menu, MenuItem, Stack, Typography} from '@mui/material';
import {pushItem, removeAt, replaceAt} from "../../../common/arrayDraft";
import AddIcon from "@mui/icons-material/Add";
import OutputLinkEditor from "./OutputLinkEditor";
import MyAccordion from "../util/MyAccordion";

interface Props {
    links: OutputLink[];
    onChangeLinks: (nextLinks: OutputLink[]) => void;
}

export default function OutputLinks({links, onChangeLinks}: Props) {
    const [addLinkMenuAnchor, setAddLinkMenuAnchor] = useState<HTMLElement | null>(null);
    const linkOptions: {kind: OutputLinkKind, label: string}[] = [
        {kind: 'vrchat.sps.plug', label: 'SPS Plugs'},
        {kind: 'vrchat.sps.socket', label: 'SPS Sockets'},
        {kind: 'vrchat.sps.touch', label: 'SPS Touch Zones'},
        {kind: 'systemAudio', label: 'System Audio'},
        {kind: 'constant', label: 'Constant'},
        {kind: 'vrchat.avatarParameter', label: 'VRC Avatar Parameter'},
    ];
    const linkOptionMap = new Map(linkOptions.map(option => [option.kind, option]));
    const buildLink = (kind: OutputLinkKind): OutputLink => {
        switch (kind) {
            case 'vrchat.sps.plug':
                return {kind, filter: {include: [], exclude: []}, touchSelf: false, touchOthers: true, penSelf: false, penOthers: true, frotOthers: true, mutators: []};
            case 'vrchat.sps.socket':
                return {kind, filter: {include: [], exclude: []}, touchSelf: false, touchOthers: true, penSelf: false, penOthers: true, frotOthers: true, mutators: []};
            case 'vrchat.sps.touch':
                return {kind, filter: {include: [], exclude: []}, mutators: []};
            case 'vrchat.avatarParameter':
                return {kind, parameter: '', mutators: []};
            case 'systemAudio':
                return {kind, mutators: []};
            case 'constant':
                return {kind, level: 0.1};
        }
    };

    const addLink = (kind: OutputLinkKind) => {
        onChangeLinks(produce(links, (draft) => pushItem(draft, buildLink(kind))));
        setAddLinkMenuAnchor(null);
    };

    return (
        <Stack spacing={0}>
            {links.map((link, index) => {
                return (
                    <OutputLinkEditor
                        key={index}
                        link={link}
                        label={linkOptionMap.get(link.kind)?.label ?? link.kind}
                        onChange={nextLink => onChangeLinks(produce(links, (draft) => replaceAt(draft, index, nextLink)))}
                        onRemove={() => onChangeLinks(produce(links, (draft) => removeAt(draft, index)))}
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
                {linkOptions.map(opt => (
                    <MenuItem key={opt.kind} onClick={() => addLink(opt.kind)}>
                        {opt.label}
                    </MenuItem>
                ))}
            </Menu>
        </Stack>
    );
}
