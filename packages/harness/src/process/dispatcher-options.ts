import type { Context } from '@deepseek-ai/cordis';
import type { AiModelRoute, HarnessNativeFrame } from '@smarteverything/domain';
import type { HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessAuthority } from '../host/server-policy';
import type { NativeMediaNote } from './native-media-note';
import type { HarnessControlPersistence } from './contracts';
import type { HarnessAttachment } from './attachments';

export interface HarnessDispatcherOptions extends Pick<
  HarnessRuntimeOptions,
  'host' | 'desiredConfiguration' | 'installedPlugins' | 'configurationChanged' | 'serverToolAccess'
> {
  readonly configurationPending?: NonNullable<HarnessRuntimeOptions['configurationPending']>;
  readonly persistence: HarnessControlPersistence;
  readonly installModelRoutes: (ctx: Context) => Promise<void>;
  readonly publish: (frame: HarnessNativeFrame) => Promise<void>;
  readonly route: (id: string) => AiModelRoute;
  readonly describeImage?: NativeMediaNote;
  readonly loadAttachments?: (
    sessionId: string,
    ids: readonly string[],
  ) => AsyncIterable<HarnessAttachment>;
  readonly authority?: (id: string) => HarnessAuthority;
}
