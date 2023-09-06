import os from "os";
import {Service} from "typedi";

/** Keeps track of what local IP addresses belong to this machine */
@Service()
export default class MyAddressesService {
    private myAddresses = new Set<string>();

    constructor() {
        this.update();
        setInterval(() => this.update(), 5000);
    }

    private update() {
        this.myAddresses = new Set(
            Object.values(os.networkInterfaces())
                .flatMap(infs => infs)
                .map(inf => inf?.address)
                .filter(address => address != undefined)
                .map(address => address!)
        );
    }

    has(ip: string) {
        return this.myAddresses.has(ip);
    }
}
