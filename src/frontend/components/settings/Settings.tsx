import {useEffect, useRef, useState} from 'react';
import React from 'react';
import SettingsBody from "./SettingsBody";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Stack,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {invokeIpc} from "../../ipc";
import {SettingsStatePayload} from "../../../common/ipcContract";
import {Result} from "../../../common/result";
import {Config} from "../../../common/configTypes";
import {type PrimitiveAtom, useAtomValue} from "jotai";
import {selectAtom} from "jotai/utils";
import typia from "typia";
import useIpcBackedCache from "./useIpcBackedCache";
import {SettingsStateAtomProvider} from "./SettingsStateAtomContext";

export default function Settings() {
    type ResetTarget = 'config' | 'backendData';
    const parseConfigResult = React.useCallback((raw: unknown) => typia.assert<Result<Config>>(raw), []);
    const parseSettingsStateResult = React.useCallback(
        (raw: unknown) => typia.assert<Result<SettingsStatePayload>>(raw),
        [],
    );
    const {
        dataAtom: configAtom,
        loadError,
        saveError,
        saveState,
    } = useIpcBackedCache<Config>({
        changeEvent: 'config:changed',
        requestInvoke: 'config:request',
        parseResult: parseConfigResult,
        saveInvoke: 'config:set',
    });
    const {
        dataAtom: settingsStateAtom,
        loadError: stateLoadError,
    } = useIpcBackedCache<SettingsStatePayload>({
        changeEvent: 'settings-state:changed',
        requestInvoke: 'settings-state:request',
        parseResult: parseSettingsStateResult,
        pollMs: 100,
    });
    const hasConfigData = useAtomValue(React.useMemo(() => selectAtom(configAtom, value => value !== undefined), [configAtom]));
    const hasSettingsStateData = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, value => value !== undefined), [settingsStateAtom]),
    );
    const updateAvailable = useAtomValue(
        React.useMemo(() => selectAtom(settingsStateAtom, value => value?.updateAvailable), [settingsStateAtom]),
    );
    const canShowUpdateAction = updateAvailable !== undefined
        && updateAvailable.status !== 'error';
    const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | undefined>(undefined);
    const [resetTarget, setResetTarget] = useState<ResetTarget | undefined>(undefined);
    const [devToolsUnlocked, setDevToolsUnlocked] = useState(false);
    const devSequenceRef = useRef('');

    useEffect(() => {
        const nextKey = updateAvailable
            ? `${updateAvailable.status}:${updateAvailable.version ?? ''}:${updateAvailable.downloadUrl ?? ''}`
            : undefined;
        setDismissedUpdateKey((current) => current === nextKey ? current : undefined);
    }, [updateAvailable]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            if (event.key.length !== 1) return;
            const target = event.target;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement && target.isContentEditable)
            ) {
                return;
            }

            devSequenceRef.current = (devSequenceRef.current + event.key.toLowerCase()).slice(-3);
            if (devSequenceRef.current === 'dev') {
                devSequenceRef.current = '';
                setDevToolsUnlocked((value) => !value);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const openConfigFile = async () => {
        await invokeIpc('config:open');
    };

    const openBackendDataFile = async () => {
        await invokeIpc('backendData:open');
    };

    return (
        <Box sx={{p: 2, overflowY: 'auto', height: '100%', bgcolor: 'background.default'}}>
            <Stack spacing={2}>
                {devToolsUnlocked && (
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={1.25} alignItems="flex-start">
                        <Stack spacing={1}>
                            <Button variant="outlined" onClick={openConfigFile}>
                                Open config
                            </Button>
                            <Button variant="contained" color="error" onClick={() => setResetTarget('config')}>
                                Reset config
                            </Button>
                        </Stack>
                        <Stack spacing={1}>
                            <Button variant="outlined" onClick={openBackendDataFile}>
                                Open backend Data
                            </Button>
                            <Button variant="contained" color="error" onClick={() => setResetTarget('backendData')}>
                                Reset backend Data
                            </Button>
                        </Stack>
                    </Stack>
                )}

                {loadError && <Alert severity="error">{loadError}</Alert>}
                {stateLoadError && <Alert severity="error">{stateLoadError}</Alert>}
                {saveError && <Alert severity="error">{saveError}</Alert>}
                {hasSettingsStateData && updateAvailable && dismissedUpdateKey !== `${updateAvailable.status}:${updateAvailable.version ?? ''}:${updateAvailable.downloadUrl ?? ''}` && (
                    <Alert
                        severity={updateAvailable.status === 'error' ? 'error' : 'warning'}
                        action={(
                            <Stack direction="row" spacing={1} alignItems="center">
                                {canShowUpdateAction && (
                                    <Button
                                        color="inherit"
                                        size="small"
                                        disabled={updateAvailable.status === 'downloading'}
                                        onClick={async () => {
                                            if (updateAvailable.status === 'installIpc') {
                                                await invokeIpc('updater:install');
                                                return;
                                            }
                                            window.open(updateAvailable.downloadUrl ?? "https://osc.toys", "_blank");
                                        }}
                                    >
                                        {updateAvailable.status === 'downloading'
                                            ? 'Downloading...'
                                            : updateAvailable.status === 'installIpc'
                                                ? 'Install'
                                                : 'Download'}
                                    </Button>
                                )}
                                <IconButton
                                    size="small"
                                    color="inherit"
                                    onClick={() => {
                                        setDismissedUpdateKey(`${updateAvailable.status}:${updateAvailable.version ?? ''}:${updateAvailable.downloadUrl ?? ''}`);
                                    }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        )}
                    >
                        {updateAvailable.status === 'error'
                            ? 'Failed to check for updates'
                            : `New update available: ${updateAvailable.version}`}
                    </Alert>
                )}
                {!hasConfigData && !loadError && (
                    <Alert severity="info">Loading configuration...</Alert>
                )}
                {hasConfigData && !hasSettingsStateData && !stateLoadError && (
                    <Alert severity="info">Loading settings state...</Alert>
                )}

                {hasConfigData && hasSettingsStateData && !loadError && !stateLoadError && (
                    <SettingsStateAtomProvider atom={settingsStateAtom as PrimitiveAtom<SettingsStatePayload>}>
                        <SettingsBody
                            configAtom={configAtom as PrimitiveAtom<Config>}
                            settingsStateAtom={settingsStateAtom as PrimitiveAtom<SettingsStatePayload>}
                        />
                    </SettingsStateAtomProvider>
                )}
            </Stack>

            <Box
                sx={{
                    position: 'fixed',
                    top: 12,
                    right: 12,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 1,
                    bgcolor: 'success.light',
                    border: 1,
                    borderColor: 'success.main',
                    color: 'success.dark',
                    opacity: (saveState === 'saving' || saveState === 'saved') ? 1 : 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.2s ease',
                }}
            >
                {saveState === 'saving' ? 'Saving...' : 'Saved'}
            </Box>

            <Dialog
                open={resetTarget !== undefined}
                onClose={() => setResetTarget(undefined)}
                aria-labelledby="reset-config-title"
                aria-describedby="reset-config-description"
            >
                <DialogTitle id="reset-config-title">Reset {resetTarget === 'backendData' ? 'backend data' : 'settings'}?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="reset-config-description">
                        {resetTarget === 'backendData'
                            ? 'This will overwrite backendData.json with default data.'
                            : 'This will overwrite config.json with default settings.'}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setResetTarget(undefined)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            if (resetTarget === 'backendData') {
                                await invokeIpc('backendData:reset');
                            } else {
                                await invokeIpc('config:reset');
                            }
                            setResetTarget(undefined);
                        }}
                    >
                        Reset
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
