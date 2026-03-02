import EventEmitter from "events";
import TypedEmitter, {type EventMap} from "typed-emitter";

type TypedEventEmitterClass = new <TEvents extends EventMap>() => TypedEmitter<TEvents>;

const TypedEventEmitter = EventEmitter as TypedEventEmitterClass;

export default TypedEventEmitter;
