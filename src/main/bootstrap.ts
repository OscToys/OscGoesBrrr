import {app, dialog} from 'electron';

let fatalExitStarted = false;

function toErrorMessage(error: unknown) {
    if (error && typeof error === 'object') {
        if ('stack' in error && typeof error.stack === 'string' && error.stack.length > 0) return error.stack;
        if ('message' in error && typeof error.message === 'string' && error.message.length > 0) return error.message;
    }
    return String(error ?? 'Unknown error');
}

function fatalExit(title: string, error: unknown) {
    if (fatalExitStarted) {
        process.exit(1);
    }
    fatalExitStarted = true;

    try {
        console.error(title, error);
        dialog.showErrorBox(title, toErrorMessage(error));
    } catch {
        // Keep going; process still needs to exit.
    }

    try {
        app.quit();
    } catch {}
    try {
        app.exit(1);
    } catch {}
    process.exit(1);
}

process.on('uncaughtException', error => fatalExit('Fatal Error', error));
process.on('unhandledRejection', error => fatalExit('Unhandled Rejection', error));

try {
    await import('./main');
} catch (error) {
    fatalExit('App threw an error during load', error);
}
