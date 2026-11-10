// Eagerly load plugin entry points so their decorators register before DI resolution.
// The naming convention excludes tests and helpers such as VrchatDiagnostics.
import.meta.glob('../../plugins/*/main/*Plugin.ts', {eager: true});
