import typia from "typia";

export default function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
    return typia.is<NodeJS.ErrnoException>(error)
        && error.code === 'ENOENT';
}
