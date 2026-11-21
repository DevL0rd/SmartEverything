import type { ChatWidget } from '@smarteverything/domain';
import { ToolError, type ToolContext } from '../extensions/mcp/tools/registry';

export async function showWidgets(
  context: Pick<ToolContext, 'store' | 'clock' | 'actor'>,
  widgets: readonly ChatWidget[],
): Promise<Readonly<Record<string, number | readonly string[]>>> {
  const { actor, store, clock } = context;
  const chatId = actor?.chatId ?? null;
  if (actor === null || chatId === null) {
    throw new ToolError('widget_show only works while you are writing a reply in a chat');
  }
  const viewer = { profileId: actor.profileId, now: clock.now().getTime() };
  const shown = await store.host.write('chatWidgetsShow', { chatId, viewer, widgets });
  if (shown.kind === 'no_reply') {
    throw new ToolError('There is no reply being written in this chat to attach widgets to');
  }
  if (shown.kind === 'rejected') {
    throw new ToolError(`No widget was attached. ${shown.reasons.join('. ')}.`);
  }
  const { added, dropped } = shown;
  return { added, already_shown: widgets.length - added - dropped.length, dropped };
}
