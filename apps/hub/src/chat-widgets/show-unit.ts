import type { ChatWidget } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import { attachWidgets, workingReply, type AttachedWidgets } from './attach-widgets';
import { widgetRejection, type WidgetViewer } from './widget-check';

export interface WidgetShow {
  readonly chatId: string;
  readonly viewer: WidgetViewer;
  readonly widgets: readonly ChatWidget[];
}

export type WidgetShown =
  | { readonly kind: 'no_reply' }
  | { readonly kind: 'rejected'; readonly reasons: readonly string[] }
  | ({ readonly kind: 'attached' } & AttachedWidgets);

function showWidgetsNow(store: Store, input: WidgetShow): WidgetShown {
  const reply = workingReply(store, input.chatId);
  if (reply === null) return { kind: 'no_reply' };
  const reasons = input.widgets.flatMap(
    (widget) => widgetRejection(store, widget, input.viewer) ?? [],
  );
  if (reasons.length > 0) return { kind: 'rejected', reasons };
  return { kind: 'attached', ...attachWidgets(store, reply, input.widgets) };
}

export const WIDGETS_SHOW_UNIT = storeUnit(showWidgetsNow);
