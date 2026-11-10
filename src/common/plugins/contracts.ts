import type {IntifaceConfig} from '../../plugins/intiface/shared/config';
import type {VrchatConfig, VrchatLink} from '../../plugins/vrchat/shared/config';
import type {OutputLinkSystemAudio} from '../../plugins/audio/shared/config';
import type {OutputLinkConstant} from '../../plugins/constant/shared/config';
import type {AudioIpcEventMap, AudioIpcInvokeMap} from '../../plugins/audio/shared/ipc';
import type {IntifaceSettingsState} from '../../plugins/intiface/shared/ipc';
import type {VrchatIpcInvokeMap, VrchatSettingsState} from '../../plugins/vrchat/shared/ipc';

// Keep the persisted and IPC contracts explicit while composing plugin-owned fields.
export interface PluginConfig extends IntifaceConfig, VrchatConfig {}
export type PluginLink = VrchatLink | OutputLinkSystemAudio | OutputLinkConstant;
export interface PluginSettingsState extends IntifaceSettingsState, VrchatSettingsState {}
export interface PluginIpcInvokeMap extends AudioIpcInvokeMap, VrchatIpcInvokeMap {}
export interface PluginIpcEventMap extends AudioIpcEventMap {}

export type {
    OutputLinkVrchatSpsPlug,
    OutputLinkVrchatSpsSocket,
    OutputLinkVrchatTouch,
    OutputLinkVrchatAvatarParameter,
} from '../../plugins/vrchat/shared/config';
export type {OutputLinkSystemAudio} from '../../plugins/audio/shared/config';
export type {OutputLinkConstant} from '../../plugins/constant/shared/config';
export type {OscStatus, OscqueryStatus, SettingsStateVrchat} from '../../plugins/vrchat/shared/ipc';
