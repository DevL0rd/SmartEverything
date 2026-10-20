import { chatWidgetKey } from '@smarteverything/domain';
import { useExtensionWidgets } from '../../../plugins/declared/use-extension-widgets';
import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { BOARD_CATALOGUE, MissingWidgetError } from './board-sources';
import { useRemoteDevice } from './remote-device';
import { WidgetUnavailableError } from './unavailable';
import { resolveWidget, type BoardChatWidget, type ResolvedWidget } from './widget-sources';

export interface UnavailableEntry {
  readonly status: 'unavailable';
  readonly key: string;
  readonly subject: string;
  readonly reason: string;
  readonly cause: unknown;
}

interface ReadyEntry {
  readonly status: 'ready';
  readonly widget: ResolvedWidget;
}

export type LaneEntry = ReadyEntry | UnavailableEntry;

const REMOVED = 'It was removed or is offline.';

const SUBJECT: Readonly<Record<BoardChatWidget['kind'], string>> = {
  device: 'this device',
  remote: 'this remote',
  camera: 'this camera',
  health: 'this health data',
  nutrition: 'this food and water data',
  board: 'this widget',
  weather: 'the weather',
  scenes: 'the scenes',
};

function missingReason(state: StoreState, widget: BoardChatWidget): string | null {
  if (widget.kind === 'device' || widget.kind === 'camera') {
    return state.tables.devices.byId[widget.id] === undefined ? REMOVED : null;
  }
  if (widget.kind === 'scenes') {
    return state.tables.scenes.ids.length === 0 ? 'There are no scenes yet.' : null;
  }
  if (widget.kind === 'weather') {
    return state.weather === null ? 'This home has no weather yet.' : null;
  }
  return null;
}

function sameReasons(left: readonly (string | null)[], right: readonly (string | null)[]): boolean {
  return left.length === right.length && left.every((reason, index) => reason === right[index]);
}

function unavailable(
  widget: BoardChatWidget,
  reason: string,
  cause: unknown,
  subject: string = SUBJECT[widget.kind],
): UnavailableEntry {
  return { status: 'unavailable', key: chatWidgetKey(widget), subject, reason, cause };
}

function failure(widget: BoardChatWidget, cause: unknown): UnavailableEntry {
  if (cause instanceof WidgetUnavailableError) {
    return unavailable(widget, cause.reason, null, cause.subject);
  }
  if (cause instanceof MissingWidgetError) {
    return unavailable(widget, 'This widget is no longer part of the app.', cause);
  }
  return unavailable(widget, 'Something went wrong while loading it.', cause);
}

export function useLaneEntries(widgets: readonly BoardChatWidget[]): readonly LaneEntry[] {
  const remoteDevice = useRemoteDevice();
  const extensions = useExtensionWidgets(BOARD_CATALOGUE);
  const missing = useStoreSelector(
    (state) => widgets.map((widget) => missingReason(state, widget)),
    sameReasons,
    [widgets.map(chatWidgetKey).join('|')],
  );
  return widgets.map((widget, index): LaneEntry => {
    const reason = missing[index] ?? null;
    if (reason !== null) {
      return unavailable(widget, reason, null);
    }
    try {
      return {
        status: 'ready',
        widget: resolveWidget(chatWidgetKey(widget), widget, remoteDevice, extensions),
      };
    } catch (cause) {
      return failure(widget, cause);
    }
  });
}
