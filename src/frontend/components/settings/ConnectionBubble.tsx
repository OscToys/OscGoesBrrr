import React from "react";
import {Box} from "@mui/material";

interface Props {
    color: string;
}

export default function ConnectionBubble({color}: Props) {
    return <Box sx={{width: 10, height: 10, borderRadius: '50%', bgcolor: color}} />;
}

