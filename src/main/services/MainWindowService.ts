import {BrowserWindow} from "electron";

export default class MainWindowService {
    constructor(
        private getter: () => BrowserWindow | undefined
    ) {
    }
    get() {
        return this.getter();
    }
}
