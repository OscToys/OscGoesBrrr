import typia from 'typia';
import type {Config} from '../common/application/configTypes';
import type {SettingsStatePayload} from '../common/application/ipcContract';
import type {Result} from '../common/result';

export const parseConfigResult = (raw: unknown) => typia.assert<Result<Config>>(raw);
export const parseSettingsStateResult = (raw: unknown) => typia.assert<Result<SettingsStatePayload>>(raw);
