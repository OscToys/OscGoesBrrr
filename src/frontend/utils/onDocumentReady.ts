/** Module loading can finish after DOMContentLoaded, especially with async dependencies. */
export default function onDocumentReady(
    callback: () => void,
    target: Pick<Document, 'readyState' | 'addEventListener'> = document,
) {
    if (target.readyState === 'loading') target.addEventListener('DOMContentLoaded', callback, {once: true});
    else callback();
}
