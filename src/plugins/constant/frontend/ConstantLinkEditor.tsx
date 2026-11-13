import React from 'react';
import {Box, Slider, Typography} from '@mui/material';
import {useAtom} from 'jotai';
import type {LinkEditorProps} from '../../../frontend/plugins/Plugin';
import {isConstantLink} from '../shared/config';

export default function ConstantLinkEditor({linkAtom}: LinkEditorProps) {
    const [link, setLink] = useAtom(linkAtom);
    if (!isConstantLink(link)) return null;
    const updateConstant = (value: number) => setLink({...link, level: value / 100});
    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{mb: 0.5}}>
                Level ({Math.round(link.level * 100000) / 1000}%)
            </Typography>
            <Slider
                value={Math.round(link.level * 100000) / 1000}
                min={0}
                max={100}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
                onChange={(_e, value) => {
                    if (typeof value !== 'number') return;
                    updateConstant(value);
                }}
            />
        </Box>
    );
}
