import type { PluginAssistant, PluginFiles, PluginPeopleView } from '../contract';
import type { Authority } from './authority';
import type { Channels } from './channels';
import type { ContextIndex } from './context-index';
import type { Directory } from './directory';
import type { Identity } from './identity';
import type { DiscordRest } from './link';
import type { Downloader } from './media-download';
import type { MediaService } from './media-service';
import type { OriginStore } from './origins';
import type { Policy } from './policy';
import type { Flows } from './prompts';
import type { Sender } from './sender';
import type { DiscordSettings } from './settings';

export interface ActivityVisibility {
  readonly progress: () => boolean;
  readonly set: (on: boolean) => Promise<void>;
}

export interface DiscordServices {
  readonly settings: DiscordSettings;
  readonly rest: DiscordRest;
  readonly identity: Identity;
  readonly policy: Policy;
  readonly people: PluginPeopleView;
  readonly directory: Directory;
  readonly channels: Channels;
  readonly origins: OriginStore;
  readonly authority: Authority;
  readonly sender: Sender;
  readonly context: ContextIndex;
  readonly media: MediaService;
  readonly flows: Flows;
  readonly assistant: PluginAssistant;
  readonly download: Downloader;
  readonly machineFile: PluginFiles['fromMachine'];
  readonly activity: ActivityVisibility;
  readonly now: () => number;
}
