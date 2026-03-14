import React, {FocusEvent, KeyboardEvent, useEffect, useRef, useState} from "react";
import {Autocomplete, TextField} from "@mui/material";

interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    helperText?: string;
    disabled?: boolean;
    liveNormalize?: (next: string) => string;
    suggestions?: string[];
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
    onCommit: (next: string) => void;
}

export default function TextCommitInput({value, label, placeholder, helperText, disabled, liveNormalize, suggestions, startAdornment, endAdornment, onCommit}: Props) {
    const [draft, setDraft] = useState(value);
    const [focused, setFocused] = useState(false);
    const skipNextBlurCommitRef = useRef(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const suggestionOptions = suggestions
        ? Array.from(new Set(suggestions.map(value => value.trim()).filter(Boolean)))
        : [];
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

    if (suggestionOptions.length > 0) {
        return (
            <Autocomplete
                freeSolo
                disableClearable
                options={suggestionOptions}
                inputValue={focused ? draft : value}
                onInputChange={(_event, next) => {
                    setDraft(liveNormalize ? liveNormalize(next) : next);
                }}
                onChange={(_event, nextValue) => {
                    if (typeof nextValue !== 'string') return;
                    const normalized = liveNormalize ? liveNormalize(nextValue) : nextValue;
                    setDraft(normalized);
                    commit(normalized);
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        inputRef={inputRef}
                        spellCheck={false}
                        size="small"
                        fullWidth
                        label={label}
                        placeholder={placeholder}
                        helperText={helperText}
                        disabled={disabled}
                        InputLabelProps={{shrink: true}}
                        InputProps={{
                            ...params.InputProps,
                            startAdornment: (
                                <>
                                    {startAdornment}
                                    {params.InputProps.startAdornment}
                                </>
                            ),
                            endAdornment: (
                                <>
                                    {params.InputProps.endAdornment}
                                    {endAdornment}
                                </>
                            ),
                        }}
                        onFocus={() => setFocused(true)}
                        onBlur={onBlur}
                        onKeyDown={onKeyDown}
                    />
                )}
            />
        );
    }

    return (
        <TextField
            inputRef={inputRef}
            value={focused ? draft : value}
            spellCheck={false}
            size="small"
            fullWidth
            disabled={disabled}
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
