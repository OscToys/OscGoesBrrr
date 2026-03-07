import React from "react";
import {produce} from "immer";
import {Button, IconButton, InputAdornment, Stack, TextField, Typography} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CloseIcon from "@mui/icons-material/Close";
import TextCommitInput from "./util/TextCommitInput";
import {OutputLinkFilter} from "../../common/configTypes";
import {pushItem, removeAt, replaceAt} from "../../common/arrayDraft";

interface Props {
    filter: OutputLinkFilter;
    itemLabel: string;
    suggestions?: string[];
    onChange: (next: OutputLinkFilter) => void;
}

export default function Filter({filter, itemLabel, suggestions, onChange}: Props) {
    const itemLabelPlural = `${itemLabel}s`;
    const idPlaceholder = `${itemLabel} ID`;
    const includeAllLabel = filter.include.length === 0 ? `All ${itemLabelPlural}` : undefined;

    const setFilterItem = (field: 'include' | 'exclude', index: number, value: string) => onChange(produce(filter, (draft) => replaceAt(draft[field], index, value)));

    const addFilterItem = (field: 'include' | 'exclude') => onChange(produce(filter, (draft) => pushItem(draft[field], '')));

    const removeFilterItem = (field: 'include' | 'exclude', index: number) => onChange(produce(filter, (draft) => removeAt(draft[field], index)));

    return (
        <Stack spacing={1}>
            <Stack spacing={0.75}>
                {includeAllLabel && (
                    <TextField
                        size="small"
                        fullWidth
                        spellCheck={false}
                        value={includeAllLabel}
                        disabled
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start" sx={{color: 'success.main'}}>
                                        <AddIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                )}
                {filter.include.map((value, index) => (
                    <TextCommitInput
                        key={`include-${index}`}
                        value={value}
                        placeholder={idPlaceholder}
                        suggestions={suggestions}
                        liveNormalize={next => next.replace(/[,\s]+/g, '')}
                        onCommit={next => setFilterItem('include', index, next)}
                        startAdornment={
                            <InputAdornment position="start" sx={{color: 'success.main'}}>
                                <AddIcon fontSize="small" />
                            </InputAdornment>
                        }
                        endAdornment={
                            <InputAdornment position="end">
                                <IconButton
                                    color="error"
                                    aria-label={`Remove include ${index + 1}`}
                                    onClick={() => removeFilterItem('include', index)}
                                    edge="end"
                                    size="small"
                                    sx={{width: 28, height: 28, borderRadius: '50%'}}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        }
                    />
                ))}
                {filter.exclude.map((value, index) => (
                    <TextCommitInput
                        key={`exclude-${index}`}
                        value={value}
                        placeholder={idPlaceholder}
                        suggestions={suggestions}
                        liveNormalize={next => next.replace(/[,\s]+/g, '')}
                        onCommit={next => setFilterItem('exclude', index, next)}
                        startAdornment={
                            <InputAdornment position="start" sx={{color: 'error.main'}}>
                                <RemoveIcon fontSize="small" />
                            </InputAdornment>
                        }
                        endAdornment={
                            <InputAdornment position="end">
                                <IconButton
                                    color="error"
                                    aria-label={`Remove exclude ${index + 1}`}
                                    onClick={() => removeFilterItem('exclude', index)}
                                    edge="end"
                                    size="small"
                                    sx={{width: 28, height: 28, borderRadius: '50%'}}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        }
                    />
                ))}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={0.75}>
                        <Button
                            type="button"
                            size="small"
                            variant="outlined"
                            startIcon={<AddIcon fontSize="small" sx={{color: 'success.main'}} />}
                            onClick={() => addFilterItem('include')}
                        >
                            Include
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            variant="outlined"
                            startIcon={<RemoveIcon fontSize="small" sx={{color: 'error.main'}} />}
                            onClick={() => addFilterItem('exclude')}
                        >
                            Exclude
                        </Button>
                    </Stack>
                </Stack>
            </Stack>
        </Stack>
    );
}
