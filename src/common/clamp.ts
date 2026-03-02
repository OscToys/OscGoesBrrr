export default function clamp(value: number, min: number, max: number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    if (Number.isNaN(value)) return low;
    if (value === Infinity) return high;
    if (value === -Infinity) return low;
    return Math.max(low, Math.min(high, value));
}
