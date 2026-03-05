import {App} from "electron";
import path from "path";

export function getPortableDataRoot(): string | undefined {
    const portableDir = process.env["PORTABLE_EXECUTABLE_DIR"];
    if (!portableDir) return undefined;
    return path.join(portableDir, "ogb-portable-data");
}

export function configurePortableDataPaths(app: App): void {
    const root = getPortableDataRoot();
    if (!root) return;

    app.setPath("appData", root);
    app.setPath("userData", root);
    app.setPath("sessionData", path.join(root, "sessionData"));
    app.setPath("cache", path.join(root, "cache"));
    app.setPath("logs", path.join(root, "logs"));
    app.setPath("crashDumps", path.join(root, "crashDumps"));
    app.setPath("temp", path.join(root, "temp"));
}
