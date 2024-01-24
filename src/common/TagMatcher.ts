import * as ohm from 'ohm-js';

const g = ohm.grammar(String.raw`
TagMatcher {
  Exp
    = statementWithSpace
    | whitespace? -- empty
  tag = ~("or" whitespace) (letter | digit | "_" | "-" | ":")+
  whitespace = space+
  andSeparator
    = (whitespace? "&&" whitespace?) -- sep1
    | (whitespace "and" whitespace) -- sep2
    | whitespace -- sep3
  and = statement andSeparator statement
  orSeparator
    = (whitespace? "||" whitespace?) -- sep1
    | (whitespace "or" whitespace) -- sep2
  or = statement orSeparator statement
  paren = "(" statementWithSpace ")"
  negated = ("-" | "!") (paren | tag)
  statement = paren | negated | and | or | tag
  statementWithSpace = whitespace? statement whitespace?
}
`);

const semantics = g.createSemantics();
semantics.addOperation('eval(tags)', {
    Exp(e) {
        return e['eval'](this['args'].tags);
    },
    Exp_empty(e) {
        return true;
    },
    tag(tag) {
        return this['args'].tags.includes(tag.sourceString);
    },
    and(a, _, b) {
        return a['eval'](this['args'].tags) && b['eval'](this['args'].tags);
    },
    or(a, _, b) {
        return a['eval'](this['args'].tags) || b['eval'](this['args'].tags);
    },
    paren(_a, e, _b) {
        return e['eval'](this['args'].tags);
    },
    negated(_, e) {
        return !e['eval'](this['args'].tags);
    },
    statement(e) { return e['eval'](this['args'].tags) },
    statementWithSpace(_a, e, _b) { return e['eval'](this['args'].tags) },
});

export default class TagMatcher {
    private readonly eval: (tags: string[]) => boolean;

    constructor(query: string) {
        const match = g.match(query);
        if (match.failed()) {
            this.eval = (tags) => false;
        } else {
            const s = semantics(match);
            this.eval = (tags) => s['eval'](tags);
        }
    }
    matches(tags: string[]) {
        return this.eval(tags);
    }
}
