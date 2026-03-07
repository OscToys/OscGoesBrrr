import React from "react";
import {Accordion, AccordionDetails, AccordionSummary} from "@mui/material";
import type {AccordionProps} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface Props extends Omit<AccordionProps, 'children' | 'expanded' | 'onChange'> {
    expanded: boolean;
    onChange: (expanded: boolean) => void;
    summary: React.ReactNode;
    children?: React.ReactNode;
    expandIcon?: boolean;
}

export default function MyAccordion({expanded, onChange, summary, children, expandIcon, ...accordionProps}: Props) {
    const hasBody = children !== undefined && children !== null;
    const showExpandIcon = expandIcon ?? hasBody;
    const isClickableSummaryOnly = !hasBody && typeof accordionProps.onClick === 'function';
    const summaryFocusSx = {
        '&:focus': {
            outline: 'none',
        },
        '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
        },
    };
    const controlledProps = hasBody
        ? {expanded, onChange: (_e: React.SyntheticEvent, next: boolean) => onChange(next)}
        : {expanded: false};
    const summaryProps = hasBody
        ? {
            component: 'div' as const,
            ...(showExpandIcon ? {expandIcon: <ExpandMoreIcon />} : {}),
            disableRipple: true,
            focusRipple: false,
            sx: summaryFocusSx,
        }
        : {
            component: 'div' as const,
            ...(showExpandIcon ? {expandIcon: <ExpandMoreIcon />} : {}),
            disableRipple: true,
            focusRipple: false,
            ...(isClickableSummaryOnly ? {} : {tabIndex: -1, 'aria-disabled': true}),
            sx: {
                ...summaryFocusSx,
                cursor: isClickableSummaryOnly ? 'pointer' : 'default !important',
                '& .MuiAccordionSummary-content': {
                    my: 1.5,
                    cursor: isClickableSummaryOnly ? 'pointer' : 'default !important',
                },
                '& .MuiAccordionSummary-expandIconWrapper': {
                    cursor: isClickableSummaryOnly ? 'pointer' : 'default !important',
                },
            },
        };

    return (
        <Accordion
            {...accordionProps}
            {...controlledProps}
        >
            <AccordionSummary {...summaryProps}>
                {summary}
            </AccordionSummary>
            {hasBody && (
                <AccordionDetails sx={{padding: '16px'}}>
                    {children}
                </AccordionDetails>
            )}
        </Accordion>
    );
}
