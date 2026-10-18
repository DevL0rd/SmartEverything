import type { ChatWidget } from '@smarteverything/domain';
import { ToolError, type ToolContext } from '../extensions/mcp/tools/registry';
import { attachWidgets, workingReply } from './attach-widgets';
import { widgetRejection } from './widget-check';

export function showWidgets(
  context: Pick<ToolContext, 'store' | 'clock' | 'actor'>,
  widgets: readonly ChatWidget[],
): Readonly<Record<string, number | readonly string[]>> {
  const { actor, store, clock } = context;
  const chatId = actor?.chatId ?? null;
  if (actor === null || chatId === null) {
    throw new ToolError('show_widgets only works while you are writing a reply in a chat');
  }
  const reply = workingReply(store, chatId);
  if (reply === null) {
    throw new ToolError('There is no reply being written in this chat to attach widgets to');
  }
  const viewer = { profileId: actor.profileId, now: clock.now().getTime() };
  const rejected = widgets.flatMap((widget) => widgetRejection(store, widget, viewer) ?? []);
  if (rejected.length > 0) {
    throw new ToolError(`No widget was attached. ${rejected.join('. ')}.`);
  }
  const { added, dropped } = attachWidgets(store, reply, widgets);
  return { added, already_shown: widgets.length - added - dropped.length, dropped };
}
