import LoggerService from "../../../main/services/LoggerService";
import {Service} from "typedi";
import VrchatLogFinder from "./VrchatLogFinder";
import type {PluginContext} from '../../../main/plugins/PluginContext';
import {poll} from '../../../main/plugins/poll';

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogScanner {
    private readonly logger;
    public failure?: string;

    constructor(
        logger: LoggerService,
        private logFinder: VrchatLogFinder
    ) {
        this.logger = logger.get("logScanner");

    }

    start(context: PluginContext): void {
        poll(context, 5000, () => this.scan(), () => {});
    }

    async scan() {
        let newFailure;
        await this.logFinder.forEachLine(line => {
            if (line.includes('Could not Start OSC')) {
                newFailure = line;
            }
        });
        if (newFailure) this.logger.log("Found OSC start failure in VRC log", newFailure);
        this.failure = newFailure;
    }
}
