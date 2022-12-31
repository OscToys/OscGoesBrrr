import * as t from "io-ts";

export const Toy = t.partial({
    id: t.string,
    sources: t.array(t.string),
});
export type Toy = t.TypeOf<typeof Toy>;

export const Config = t.partial({
    toys: t.array(Toy),
});
export type Config = t.TypeOf<typeof Config>;
