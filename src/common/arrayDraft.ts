export function pushItem<T>(arr: T[], item: T): void {
    arr.push(item);
}

export function replaceAt<T>(arr: T[], index: number, item: T): void {
    if (index < 0 || index >= arr.length) return;
    arr[index] = item;
}

export function removeAt<T>(arr: T[], index: number): void {
    if (index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
}
