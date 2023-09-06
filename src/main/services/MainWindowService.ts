import type {BrowserWindow} from "electron";
import {Service} from "typedi";

export default class MainWindowService {
    getter?: () => BrowserWindow | undefined;
    //constructor(getter: () => BrowserWindow | undefined) {
//        this.getter = getter;
//    }
    get() {
        return this.getter!();
    }
}
