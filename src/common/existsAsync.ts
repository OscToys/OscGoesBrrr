import fs from "fs/promises";

export default async function existsAsync(path: string) {
    try { await fs.access(path); return true; } catch(e) {}
    return false;
}
