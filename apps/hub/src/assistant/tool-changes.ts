import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubTool } from '../ai-tools/hub-tool';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Store } from '../store/store';
import type { ConversationLog } from './conversation-log';

const SETTING_KEY = 'tool_set';
const SETTLE_MS = 2000;
const ACTIVE_DAYS = 7;
const NAMES_SHOWN_MAX = 12;

const STORED = z.strictObject({ names: z.array(z.string()) });

export interface ToolChangesDeps {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly now: () => Date;
  readonly log: Logger;
}

function groupOf(tool: HubTool): string {
  return tool.origin.kind === 'plugin' ? (tool.title.split(':')[0] ?? 'plugin') : 'home';
}

function counted(sign: string, tools: readonly HubTool[]): string[] {
  const groups = new Map<string, number>();
  tools.forEach((tool) => groups.set(groupOf(tool), (groups.get(groupOf(tool)) ?? 0) + 1));
  return [...groups].map(([group, count]) => {
    const noun = count === 1 ? 'tool' : 'tools';
    return `${sign}${String(count)} ${group} ${noun}`;
  });
}

function namesText(added: readonly string[], removed: readonly string[]): string {
  const names = [...added.map((name) => `+${name}`), ...removed.map((name) => `−${name}`)];
  const shown = names.slice(0, NAMES_SHOWN_MAX).join(', ');
  return names.length > NAMES_SHOWN_MAX ? `${shown}, …` : shown;
}

export class ToolChanges {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: ToolChangesDeps) {}

  attach(hub: ToolHub): void {
    hub.changes(() => {
      this.settle(hub);
    });
    this.check(hub);
  }

  private settle(hub: ToolHub): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check(hub);
    }, SETTLE_MS);
    this.timer.unref();
  }

  private check(hub: ToolHub): void {
    const { aiChats } = this.deps.store;
    const tools = hub.list();
    const names = tools.map((tool) => tool.name).sort();
    const saved = aiChats.setting(SETTING_KEY);
    aiChats.saveSetting(SETTING_KEY, { names });
    if (saved === null) {
      return;
    }
    const before = new Set(STORED.parse(saved).names);
    const now = new Set(names);
    const added = tools.filter((tool) => !before.has(tool.name));
    const removed = [...before].filter((name) => !now.has(name)).sort();
    if (added.length > 0 || removed.length > 0) {
      this.announce(added, removed);
    }
  }

  private announce(added: readonly HubTool[], removed: string[]): void {
    const addedNames = added.map((tool) => tool.name).sort();
    const gone = removed.length === 1 ? 'tool' : 'tools';
    const summary = [
      ...counted('+', added),
      ...(removed.length > 0 ? [`−${String(removed.length)} ${gone}`] : []),
    ];
    const text = `Tools updated: ${summary.join(', ')} (${namesText(addedNames, removed)})`;
    const since = new Date(this.deps.now().getTime() - ACTIVE_DAYS * 86_400_000).toISOString();
    const chats = this.deps.store.aiChats.activeSince(since);
    chats.forEach((chat) => {
      this.deps.conversation.toolsChanged(chat, text, {
        kind: 'tools_changed',
        added: addedNames,
        removed,
      });
    });
    this.deps.log.info('assistant.tools_changed', {
      added: addedNames.length,
      removed: removed.length,
      chats: chats.length,
    });
  }
}
