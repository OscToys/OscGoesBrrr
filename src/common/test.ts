import TagMatcher from "./TagMatcher";

const tags = ['helloWorld', 'helloWorld4', 'or2'];
const query = ' helloWorld or2 helloWorld4';
const test = new TagMatcher(query);
console.log(test.matches(tags));
