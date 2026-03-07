# Repository Agent Notes

## Config Policy
- Do not implement JSON->JSON migration/backfill logic yet.
- Nobody has released JSON configs for this project yet.
- Keep `Config` schema strict and explicit.
- If `config.json` is invalid, surface the error and block saving instead of auto-healing unknown shapes.
- Frontend must not normalize/sanitize/clean config data before save (no trimming, dedupe, default injection, or shape rewriting). Keep raw user edits; normalize only in backend service logic.

## Typecheck Routine
- Do not run a standalone common compile as the default verification step.
- Use `pnpm run typecheck` for routine verification (main + frontend only).
- Never run `webpack` unless the user explicitly instructs it.
- For `pnpm` commands that need network access (install/add/up/outdated/audit, etc.), request escalated permissions immediately so approval is prompted right away.
- For local/offline `pnpm` commands (for example `pnpm run typecheck`), run in sandbox by default.

## Event Emitters
- Always use `TypedEventEmitter` for typed event emitters instead of extending raw `EventEmitter` with manual typed overloads.
