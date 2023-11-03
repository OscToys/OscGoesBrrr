import LoggerService from "./LoggerService";
import {Service} from "typedi";
import VrchatLogFinder from "./VrchatLogFinder";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogScanner {
    private readonly logger;
    public failure: string | undefined;

    constructor(
        logger: LoggerService,
        private logFinder: VrchatLogFinder
    ) {
        this.logger = logger.get("logScanner");

        (async () => {
            while(true) {
                try { await this.scan(); } catch(e) {}
                await new Promise(r => setTimeout(r, 5000));
            }
        })();
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
