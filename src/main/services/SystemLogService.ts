import util from "util";
import LoggerService from "./LoggerService";
import {Service} from "typedi";

@Service()
export default class SystemLogService {
    constructor(
        logger: LoggerService
    ) {
        const systemLogger = logger.get('system');
        console.log = (...args) => systemLogger.log("LOG", util.format(...args));
        console.warn = (...args) => systemLogger.log("WARN", util.format(...args));
        console.error = (...args) => systemLogger.log("ERROR", util.format(...args));
        process
            .on('unhandledRejection', (reason, p) => {
                systemLogger.log('REJECTION', reason, p);
            })
            .on('uncaughtException', err => {
                systemLogger.log('EXCEPTION', err);
            });
        console.log("System log service started");
    }
}
