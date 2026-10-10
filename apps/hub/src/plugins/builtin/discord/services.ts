import type { PluginAssistant, PluginPeopleView } from '../contract';
import type { Authority } from './authority';
import type { Channels } from './channels';
import type { ContextIndex } from './context-index';
import type { Directory } from './directory';
import type { Identity } from './identity';
import type { Journal } from './journal';
import type { DiscordRest } from './link';
import type { MediaService } from './media-service';
import type { OriginStore } from './origins';
import type { Policy } from './policy';
import type { Flows } from './prompts';
import type { Sender } from './sender';
import type { DiscordSettings } from './settings';
import type { Uploads } from './uploads';

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
  readonly journal: Journal;
  readonly context: ContextIndex;
  readonly media: MediaService;
  readonly uploads: Uploads;
  readonly flows: Flows;
  readonly assistant: PluginAssistant;
  readonly fetchUrl: (url: string, signal: AbortSignal) => Promise<Response>;
  readonly sendRoots: (chatId: string | null) => readonly string[];
  readonly activity: ActivityVisibility;
  readonly now: () => number;
}
