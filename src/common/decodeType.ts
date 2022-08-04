import * as t from "io-ts";
import { PathReporter } from 'io-ts/lib/PathReporter'

export default function decodeType<A,O,I>(inst: I, type: t.Type<A,O,I>) {
    const result = type.decode(inst);
    if (result._tag == 'Left') {
        const errors = PathReporter.report(result).join('\n');
        throw new Error(errors);
    }
    return result.right;
}

export { t };
