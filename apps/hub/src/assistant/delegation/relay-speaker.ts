import {
  HELPER_DIALOGUE_KIND,
  helperDialogueOf,
  type AiChatRow,
  type AssistantMessageRow,
  type HelperDialogue,
  type MessageOrigin,
  type PluginOrigin,
} from '@smarteverything/domain';

interface RelaySpeaker {
  readonly author: string;
  readonly origin: MessageOrigin;
  readonly helperDialogue?: HelperDialogue;
}

export function isHelperDialogueMirror(row: AssistantMessageRow): boolean {
  const dialogue = helperDialogueOf(row);
  return dialogue !== undefined && (dialogue.direction !== 'from_helper' || row.role !== 'person');
}

export function directHelperDialogue(
  parent: AiChatRow,
  helper: AiChatRow,
  direction: HelperDialogue['direction'],
): HelperDialogue | undefined {
  if (
    helper.kind !== 'subagent' ||
    helper.parent_id !== parent.id ||
    helper.profile_id !== parent.profile_id
  )
    return undefined;
  if (helper.helper_name === null) throw new Error('A direct helper has no stored name.');
  return {
    kind: HELPER_DIALOGUE_KIND,
    direction,
    helper_chat_id: helper.id,
    helper_name: helper.helper_name,
  };
}

export function relayAuthor(
  assistantName: string,
  from: AiChatRow,
  hops: number | undefined,
  plugin: PluginOrigin | null,
): RelaySpeaker {
  return {
    author: from.helper_name ?? assistantName,
    origin: {
      source: from.kind === 'subagent' ? 'subagent' : 'chat',
      plugin_id: null,
      device_id: null,
      name: from.title,
      chat_id: from.id,
      ...(hops === undefined ? {} : { hops }),
      ...(plugin ?? {}),
    },
  };
}

export function relaySpeaker(
  assistantName: string,
  { from, to }: { readonly from: AiChatRow; readonly to: AiChatRow },
  hops: number | undefined,
  plugin: PluginOrigin | null,
): RelaySpeaker {
  const helperDialogue = directHelperDialogue(to, from, 'from_helper');
  return {
    ...relayAuthor(assistantName, from, hops, plugin),
    ...(helperDialogue === undefined ? {} : { helperDialogue }),
  };
}
