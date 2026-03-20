import React from "react";
import {Box, FormControl, InputLabel, OutlinedInput} from "@mui/material";

interface Props {
    label: string;
    children: React.ReactNode;
}

export default function NotchedBox({label, children}: Props) {
    return (
        <FormControl
            variant="outlined"
            fullWidth
            sx={{
                position: 'relative',
            }}
        >
            <InputLabel shrink variant="outlined" disableAnimation>
                {label}
            </InputLabel>
            <Box
                sx={{
                    position: 'relative',
                    px: '14px',
                    pt: '16.5px',
                    pb: '14px',
                }}
            >
                <OutlinedInput
                    value=""
                    readOnly
                    notched
                    label={label}
                    tabIndex={-1}
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        '& .MuiOutlinedInput-input': {
                            opacity: 0,
                            padding: '16.5px 14px',
                        },
                    }}
                />
                {children}
            </Box>
        </FormControl>
    );
}
