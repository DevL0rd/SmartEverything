import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { filesOfTransfer } from '../../../platform/pick-files';
import type { FileNode } from '../source/types';
import { blockedDropText, dropDetail, dropTitle } from '../transfer/upload-summary';
import { sendUploads } from './browser-commands';
import type { FileBrowserHandle } from './browser-types';
import {
  REFUSAL_TEXT,
  dropLabelOf,
  dropVerdictOf,
  uploadDropOf,
  type DragPayload,
  type DropTarget,
} from './drag-model';

export const FILES_DRAG_TYPE = 'application/x-smarteverything-files';

interface ActiveDrag {
  readonly sourceId: string;
  readonly owner: symbol;
}

let activeDrag: ActiveDrag | null = null;

export interface DropHintState {
  readonly text: string;
  readonly allowed: boolean;
}

export interface DragSession<O> {
  readonly owner: symbol;
  readonly payload: () => DragPayload<O> | null;
  readonly begin: (payload: DragPayload<O>) => void;
  readonly end: () => void;
  readonly hint: DropHintState | null;
  readonly setHint: (hint: DropHintState | null) => void;
}

export function useDragSession<O>(): DragSession<O> {
  const [owner] = useState(() => Symbol('file-browser'));
  const payload = useRef<DragPayload<O>>(null);
  const [hint, setHint] = useState<DropHintState | null>(null);
  return {
    owner,
    payload: () => payload.current,
    begin: (next): void => {
      payload.current = next;
      activeDrag = { sourceId: next.sourceId, owner };
    },
    end: (): void => {
      payload.current = null;
      activeDrag = null;
      setHint(null);
    },
    hint,
    setHint,
  };
}

function elementOf(ref: RefObject<unknown>): HTMLElement | null {
  return ref.current instanceof HTMLElement ? ref.current : null;
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') === true;
}

function carriesNodes(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(FILES_DRAG_TYPE) === true;
}

export function useRowDrag<O>(
  ref: RefObject<View | null>,
  session: DragSession<O>,
  payloadOf: () => DragPayload<O>,
  enabled: boolean,
): void {
  const start = useEffectEvent((): DragPayload<O> => {
    const payload = payloadOf();
    session.begin(payload);
    return payload;
  });
  const end = useEffectEvent(session.end);
  useEffect(() => {
    const element = elementOf(ref);
    if (!enabled || element === null) return undefined;
    element.draggable = true;
    const dragStart = (event: DragEvent): void => {
      const payload = start();
      const transfer = event.dataTransfer;
      if (transfer === null) return;
      transfer.setData(FILES_DRAG_TYPE, payload.sourceId);
      transfer.effectAllowed = 'copyMove';
    };
    const dragEnd = (): void => {
      end();
    };
    element.addEventListener('dragstart', dragStart);
    element.addEventListener('dragend', dragEnd);
    return (): void => {
      element.draggable = false;
      element.removeEventListener('dragstart', dragStart);
      element.removeEventListener('dragend', dragEnd);
    };
  }, [ref, enabled]);
}

export interface FolderDrop<O> {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly target: DropTarget;
  readonly name: string;
  readonly enabled: boolean;
}

type Decision =
  | { readonly kind: 'nodes'; readonly label: string; readonly run: (() => void) | null }
  | {
      readonly kind: 'files';
      readonly label: string;
      readonly run: ((event: DragEvent) => void) | null;
    }
  | { readonly kind: 'none' };

function nodesDecision<O>(drop: FolderDrop<O>, copy: boolean): Decision {
  const { browser, session, target, name } = drop;
  const payload = session.payload();
  if (payload === null || activeDrag?.owner !== session.owner) {
    return { kind: 'nodes', label: REFUSAL_TEXT.other_source, run: null };
  }
  const verdict = dropVerdictOf(payload, target, browser.abilities, copy);
  const label = dropLabelOf(verdict, name);
  if (verdict.kind === 'refused') return { kind: 'nodes', label, run: null };
  return {
    kind: 'nodes',
    label,
    run: (): void => {
      browser.commands.run(verdict.op);
    },
  };
}

function filesDecision<O>(drop: FolderDrop<O>): Decision {
  const { browser, target, name } = drop;
  const verdict = uploadDropOf(target, browser.abilities);
  if (verdict.kind === 'refused') {
    const label = blockedDropText(!browser.offline, false) ?? REFUSAL_TEXT.not_writable;
    return { kind: 'files', label, run: null };
  }
  const present = new Set(
    target.key === drop.browser.drag.folderTarget.key
      ? browser.listing.entries.map((node) => node.name)
      : [],
  );
  return {
    kind: 'files',
    label: dropTitle(name),
    run: (event): void => {
      sendUploads(browser.source, filesOfTransfer(event.dataTransfer), verdict.to, present);
    },
  };
}

function effectOf(decision: Decision, copy: boolean): DataTransfer['dropEffect'] {
  if (decision.kind === 'none' || decision.run === null) return 'none';
  if (decision.kind === 'files') return 'copy';
  return copy ? 'copy' : 'move';
}

function decide<O>(drop: FolderDrop<O>, event: DragEvent): Decision {
  if (carriesNodes(event)) return nodesDecision(drop, event.altKey);
  if (carriesFiles(event)) return filesDecision(drop);
  return { kind: 'none' };
}

export function useFolderDrop<O>(
  ref: RefObject<View | null>,
  drop: FolderDrop<O>,
  onHover: (hovering: boolean) => void,
): void {
  const decideNow = useEffectEvent((event: DragEvent) => decide(drop, event));
  const hover = useEffectEvent(onHover);
  const setHint = useEffectEvent(drop.session.setHint);
  useEffect(() => {
    const element = elementOf(ref);
    if (!drop.enabled || element === null || isNative()) return undefined;
    const over = (event: DragEvent): void => {
      const decision = decideNow(event);
      if (decision.kind === 'none') return;
      event.stopPropagation();
      if (decision.run !== null) event.preventDefault();
      const transfer = event.dataTransfer;
      if (transfer !== null) transfer.dropEffect = effectOf(decision, event.altKey);
      hover(decision.run !== null);
      setHint({ text: decision.label, allowed: decision.run !== null });
    };
    const leave = (event: DragEvent): void => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      hover(false);
      setHint(null);
    };
    const dropped = (event: DragEvent): void => {
      const decision = decideNow(event);
      event.preventDefault();
      event.stopPropagation();
      hover(false);
      setHint(null);
      if (decision.kind !== 'none') decision.run?.(event);
    };
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', dropped);
    return (): void => {
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', dropped);
    };
  }, [ref, drop.enabled]);
}

function useDragReset(reset: () => void): void {
  const run = useEffectEvent(reset);
  useEffect(() => {
    if (isNative()) return undefined;
    const end = (): void => {
      run();
    };
    globalThis.addEventListener('drop', end, true);
    globalThis.addEventListener('dragend', end, true);
    return (): void => {
      globalThis.removeEventListener('drop', end, true);
      globalThis.removeEventListener('dragend', end, true);
    };
  }, []);
}

function DropHint({ hint }: { readonly hint: DropHintState }): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-4 z-20 items-center px-4">
      <View className="max-w-full flex-row items-center gap-2 rounded-full bg-on-surface px-4 py-2.5 elevation-3">
        <Icon name={hint.allowed ? 'move' : 'ban'} size={16} tone="inverse" />
        <Text variant="callout" tone="inverse" numberOfLines={2} className="shrink">
          {hint.text}
        </Text>
      </View>
    </View>
  );
}

function DropFrame<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const name = browser.header.title;
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 z-10 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 p-6"
    >
      <View className="size-14 items-center justify-center rounded-full bg-primary-container">
        <Icon name="upload" size={24} tone="onPrimaryContainer" />
      </View>
      <Text variant="title-3" align="center">
        {dropTitle(name)}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {dropDetail(browser.source.upload.conflicts)}
      </Text>
    </View>
  );
}

export function DropZone<O>({
  browser,
  session,
  children,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly session: DragSession<O>;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  useDragReset(() => {
    setHovering(false);
    session.setHint(null);
  });
  useFolderDrop(
    ref,
    {
      browser,
      session,
      target: browser.drag.folderTarget,
      name: browser.header.title,
      enabled: true,
    },
    setHovering,
  );
  const hint = session.hint;
  const framed = hovering && hint?.text === dropTitle(browser.header.title);
  return (
    <View ref={ref} className="min-h-0 flex-1">
      {children}
      {framed ? <DropFrame browser={browser} /> : null}
      {hint === null || framed ? null : <DropHint hint={hint} />}
    </View>
  );
}

export function isDraggable<O>(browser: FileBrowserHandle<O>, node: FileNode<O>): boolean {
  return !isNative() && (browser.abilities.dragMove || browser.abilities.copy) && node.writable;
}
