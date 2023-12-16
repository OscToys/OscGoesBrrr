export default class OgbMath {
    public static remap(num: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
        const normalized = (num - fromMin) / (fromMax-fromMin);
        return normalized * (toMax-toMin) + toMin;
    }
    public static clamp(num: number, min: number, max: number) {
        if (isNaN(num)) return min;
        return Math.max(min, Math.min(max, num));
    }
}
