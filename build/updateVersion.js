import fs from 'node:fs/promises';

const raw = await fs.readFile('package.json', {encoding: 'utf-8'});
const json = JSON.parse(raw);
json.version = process.argv[2];
await fs.writeFile('package.json', JSON.stringify(json, null, 2)+"\n");
