import type { Context } from '@deepseek-ai/cordis';
import type { AiModelRoute, AiHarnessEvent } from '@smarteverything/domain';
import type { HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessAuthority } from '../host/server-policy';
import type { HarnessControlPersistence } from './contracts';
import type { HarnessAttachment } from './attachments';
import type { NativeMediaNote } from './native-media-note';

export interface HarnessDispatcherOptions extends Pick<
  HarnessRuntimeOptions,
  | 'host'
  | 'desiredConfiguration'
  | 'installedPlugins'
  | 'configurationChanged'
  | 'serverToolAccess'
  | 'projectFiles'
  | 'validateReferences'
> {
  readonly configurationPending?: NonNullable<HarnessRuntimeOptions['configurationPending']>;
  readonly persistence: HarnessControlPersistence;
  readonly installModelRoutes: (ctx: Context) => Promise<void>;
  readonly publish: (event: AiHarnessEvent) => Promise<void>;
  readonly route: (id: string) => AiModelRoute;
  readonly loadAttachments?: (
    sessionId: string,
    ids: readonly string[],
  ) => AsyncIterable<HarnessAttachment>;
  readonly describeImage?: NativeMediaNote;
  readonly authority?: (id: string) => HarnessAuthority;
}
