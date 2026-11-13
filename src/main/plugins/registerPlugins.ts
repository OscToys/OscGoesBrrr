// Eagerly load plugin entry points so their decorators register before DI resolution.
// The naming convention excludes tests and helper modules.
import.meta.glob('../../plugins/*/main/*Plugin.ts', {eager: true});
