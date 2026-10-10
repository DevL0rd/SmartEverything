import { ApiError, type PluginSetting } from '@smarteverything/domain';

export class HumanOnlySettingError extends ApiError {
  constructor(setting: PluginSetting, refusedFor: string) {
    super(
      'forbidden',
      `${setting.title} can only be changed by a person in the app, not by ${refusedFor}.`,
    );
  }
}
