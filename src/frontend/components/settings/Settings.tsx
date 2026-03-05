import {useEffect, useState} from 'react';
import React from 'react';
import SettingsBody from "./SettingsBody";
import typia from "typia";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    Typography,
} from "@mui/material";
import {invokeIpc, onIpc} from "../../ipc";
import {SettingsStatePayload} from "../../../common/ipcContract";
import {Result} from "../../../common/result";
import useFrontendConfigDataManager from "./FrontendConfigDataManager";
import {replaceEqualDeep} from "../../../common/replaceEqualDeep";

export default function Settings() {
    type ResetTarget = 'config' | 'backendData';
    const [settingsState, setSettingsState] = useState<SettingsStatePayload | undefined>();
    const [stateLoadError, setStateLoadError] = useState<string | undefined>(undefined);
    const {config, loadError, saveError, saving, savedVisible, commitConfig} = useFrontendConfigDataManager();
    const [resetTarget, setResetTarget] = useState<ResetTarget | undefined>(undefined);
    const [devToolsUnlocked, setDevToolsUnlocked] = useState(false);

    const openConfigFile = async () => {
        await invokeIpc('config:open');
    };

    const openBackendDataFile = async () => {
        await invokeIpc('backendData:open');
    };

    useEffect(() => {
        const off = onIpc('settings-state:changed', (rawPayload) => {
            try {
                const result = typia.assert<Result<SettingsStatePayload>>(rawPayload);
                if (result.ok) {
                    setSettingsState(prev => prev ? replaceEqualDeep(prev, result.data) : result.data);
                    setStateLoadError(undefined);
                    return;
                }
                setStateLoadError(result.error);
            } catch (e) {
                setStateLoadError(e instanceof Error ? e.message : String(e));
            }
        });
        let closed = false;
        (async () => {
            while (!closed) {
                await invokeIpc('settings-state:request');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        })();

        return () => {
            off();
            closed = true;
        };
    }, []);

    return (
        <Box sx={{p: 2, overflowY: 'auto', height: '100%', bgcolor: 'background.default'}}>
            <Stack spacing={2}>
                <Typography
                    variant="h4"
                    onDoubleClick={() => setDevToolsUnlocked((prev) => !prev)}
                    sx={{userSelect: 'none'}}
                >
                    Settings
                </Typography>
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
                {!config && !loadError && (
                    <Alert severity="info">Loading configuration...</Alert>
                )}

                {config && settingsState && !loadError && !stateLoadError && (
                    <SettingsBody
                        config={config}
                        settingsState={settingsState}
                        onCommitConfig={commitConfig}
                    />
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
                    opacity: (saving || savedVisible) ? 1 : 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.2s ease',
                }}
            >
                {saving ? 'Saving...' : 'Saved'}
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
