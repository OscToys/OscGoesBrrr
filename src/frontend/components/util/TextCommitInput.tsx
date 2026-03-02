import React, {FocusEvent, KeyboardEvent, useEffect, useRef, useState} from "react";
import {TextField} from "@mui/material";

interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    helperText?: string;
    liveNormalize?: (next: string) => string;
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
    onCommit: (next: string) => void;
}

export default function TextCommitInput({value, label, placeholder, helperText, liveNormalize, startAdornment, endAdornment, onCommit}: Props) {
    const [draft, setDraft] = useState(value);
    const [focused, setFocused] = useState(false);
    const skipNextBlurCommitRef = useRef(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (!focused) setDraft(value);
    }, [value, focused]);

    const commit = (next: string) => {
        if (next === value) return;
        onCommit(next);
    };
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            inputRef.current?.blur();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            skipNextBlurCommitRef.current = true;
            inputRef.current?.blur();
        }
    };

    const onBlur = (e: FocusEvent<HTMLInputElement>) => {
        setFocused(false);
        if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
        }
        commit(e.currentTarget.value);
    };

    return (
        <TextField
            inputRef={inputRef}
            value={focused ? draft : value}
            spellCheck={false}
            size="small"
            fullWidth
            slotProps={{
                inputLabel: {shrink: true},
                ...(startAdornment !== undefined || endAdornment !== undefined
                    ? {input: {startAdornment, endAdornment}}
                    : {}),
            }}
            label={label}
            placeholder={placeholder}
            helperText={helperText}
            onChange={e => {
                const next = e.currentTarget.value;
                setDraft(liveNormalize ? liveNormalize(next) : next);
            }}
            onFocus={() => setFocused(true)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
        />
    );
}
