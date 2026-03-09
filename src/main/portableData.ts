import {App} from "electron";
import path from "path";

export function getPortableExecutablePath(): string | undefined {
    const portableDir = process.env["PORTABLE_EXECUTABLE_DIR"];
    const portableFile = process.env["PORTABLE_EXECUTABLE_FILE"];
    if (!portableDir || !portableFile) return undefined;
    return path.join(portableDir, portableFile);
}

export function configurePortableDataPaths(app: App): void {
    const executablePath = getPortableExecutablePath();
    if (!executablePath) return;
    const root = path.join(path.dirname(executablePath), "ogb-portable-data");

    app.setPath("userData", root);
    app.setPath("sessionData", path.join(root, "sessionData"));
    app.setPath("temp", path.join(root, "temp"));
    app.setPath("logs", path.join(root, "logs"));
    app.setPath("crashDumps", path.join(root, "crashDumps"));
}
