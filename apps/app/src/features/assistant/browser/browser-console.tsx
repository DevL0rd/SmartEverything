import { useId, useRef, useState, type ReactNode } from 'react';
import { FlatList, type TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useIdiom } from '../../../design/platform';
import { Text } from '../../../components/text';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { BrowserConsoleFilters } from './browser-console-controls';
import { BrowserConsoleRow } from './browser-console-row';
import { matchingConsoleRecords, type ConsoleFilter } from './browser-console-model';
import { useConsoleReader } from './browser-console-reader';
import type { BrowserAction } from './browser-actions';
import { useBrowserActionScope } from './browser-action-scope';
import { useRequestedBrowserAction } from './browser-requested-action';
import type {
  ConsolePage,
  ConsoleRecord,
  PreviewDiagnostics,
  PreviewDiagnosticsSnapshot,
} from './browser-diagnostics-contract';
const DELIVERY_COPY: Readonly<Record<Exclude<ConsolePage['delivery'], 'none'>, string>> = {
  shared: 'First error shared with this chat',
  pending: 'First error is waiting to be shared with this chat',
  failed: 'First error could not be shared with this chat',
};
const CONSOLE_HEIGHT = 240;
const TOUCH_BODY_SHARE = 0.4;
interface BrowserConsoleProps {
  readonly controller: PreviewDiagnostics;
  readonly snapshot: PreviewDiagnosticsSnapshot;
  readonly availableHeight: number;
}
export function BrowserConsole({
  controller,
  snapshot,
  availableHeight,
}: BrowserConsoleProps): ReactNode {
  const { expanded, toggle } = useConsoleExpansion(snapshot);
  const region = useId();
  const height = Math.min(
    CONSOLE_HEIGHT,
    availableHeight * (useIdiom() === 'pointer' ? 1 : TOUCH_BODY_SHARE),
  );
  return (
    <View
      className="shrink-0 border-t border-outline-variant bg-surface-1"
      style={expanded ? { height } : undefined}
    >
      <DeliveryAnnouncement page={snapshot.console} />
      <ConsoleDisclosure
        expanded={expanded}
        region={region}
        errors={snapshot.console.kind === 'ready' ? snapshot.console.errors : null}
        onPress={() => {
          toggle();
        }}
      />
      <ConsoleBody
        expanded={expanded}
        region={region}
        snapshot={snapshot}
        controller={controller}
      />
    </View>
  );
}
function ConsoleDisclosure({
  expanded,
  region,
  errors,
  onPress,
}: {
  readonly expanded: boolean;
  readonly region: string;
  readonly errors: number | null;
  readonly onPress: () => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      label="Console"
      expanded={expanded}
      controls={region}
      onPress={onPress}
      className={
        pointer
          ? 'min-h-8 flex-row items-center gap-2 px-3'
          : 'min-h-touch-min flex-row items-center gap-2 px-3'
      }
    >
      <Icon name="terminal" size={16} />
      <Text variant="caption" tone="variant" className="flex-1">
        Console
      </Text>
      {errors === null || errors === 0 ? null : (
        <Text variant="caption" tone="critical">
          {errors} {errors === 1 ? 'error' : 'errors'}
        </Text>
      )}
      <Icon name={expanded ? 'chevronDown' : 'chevronUp'} size={16} />
    </Interactive>
  );
}
function ConsoleUnavailable({ reason }: { readonly reason: string }): ReactNode {
  return (
    <View className="min-h-0 flex-1 justify-center px-3 py-2">
      <Text variant="caption" tone="variant">
        {reason}
      </Text>
    </View>
  );
}
interface ConsoleEntriesProps {
  readonly page: ConsolePage;
  readonly controller: PreviewDiagnostics;
}
function ConsoleEntries({ page, controller }: ConsoleEntriesProps): ReactNode {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<ConsoleFilter>('all');
  const inputRef = useRef<TextInput>(null);
  const reader = useConsoleReader(page, controller);
  const records = matchingConsoleRecords(reader.page.records, query, level);
  useRequestedBrowserAction({
    'search-console': (): void => {
      inputRef.current?.focus();
    },
    'older-console': reader.older,
    'new-console': reader.resume,
  });
  return (
    <>
      <BrowserConsoleFilters
        query={query}
        setQuery={(value) => {
          reader.pause();
          setQuery(value);
        }}
        level={level}
        setLevel={(value) => {
          reader.pause();
          setLevel(value);
        }}
        inputRef={inputRef}
      />
      <DeliveryStatus delivery={page.delivery} />
      <ConsoleLog
        records={records}
        listRef={reader.listRef}
        onScroll={reader.scroll}
        onResize={reader.resize}
        onInspect={reader.pause}
        emptyReason={
          query.trim() === '' && level === 'all' ? 'No console output yet' : 'No matching entries'
        }
      />
      <ConsoleFooter
        page={reader.page}
        reader={reader}
        count={records.length}
        filtered={query.trim() !== '' || level !== 'all'}
      />
    </>
  );
}
function DeliveryStatus({ delivery }: { readonly delivery: ConsolePage['delivery'] }): ReactNode {
  if (delivery === 'none') return null;
  const message = DELIVERY_COPY[delivery];
  return (
    <Text
      variant="caption"
      tone={delivery === 'failed' ? 'warning' : 'variant'}
      className="px-3 py-1"
    >
      {message}
    </Text>
  );
}
function ConsoleFooter({
  page,
  reader,
  count,
  filtered,
}: {
  readonly page: ConsolePage;
  readonly reader: ReturnType<typeof useConsoleReader>;
  readonly count: number;
  readonly filtered: boolean;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 border-t border-outline-variant px-3">
      <Text variant="caption" tone="faint" className="flex-1">
        {count} {filtered ? 'matches' : 'shown'}
        {page.omittedRecords > 0
          ? ` · ${String(page.omittedRecords)} older entries no longer retained`
          : ''}
      </Text>
      {page.previousCursor === null || reader.limitReached ? null : (
        <Interactive
          label="Load older console entries"
          disabled={reader.pending}
          onPress={reader.older}
          className="min-h-touch-min justify-center"
        >
          <Text variant="caption" tone="primary">
            {reader.pending ? 'Loading older…' : 'Load older'}
          </Text>
        </Interactive>
      )}
      {reader.limitReached ? <PinnedConsoleLimit skipped={reader.skippedOlder} /> : null}
      <ConsoleResume reader={reader} />
    </View>
  );
}

interface ConsoleLogProps {
  readonly records: readonly ConsoleRecord[];
  readonly listRef: ReturnType<typeof useConsoleReader>['listRef'];
  readonly onScroll: ReturnType<typeof useConsoleReader>['scroll'];
  readonly onResize: () => void;
  readonly onInspect: () => void;
  readonly emptyReason: string;
}
function ConsoleLog({
  records,
  listRef,
  onScroll,
  onResize,
  onInspect,
  emptyReason,
}: ConsoleLogProps): ReactNode {
  return (
    <FlatList
      ref={listRef}
      data={records}
      keyExtractor={(record) => record.id}
      renderItem={({ item }) => <BrowserConsoleRow record={item} onInspect={onInspect} />}
      className="min-h-0 flex-1"
      accessibilityLabel="Console entries"
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onContentSizeChange={onResize}
      ListEmptyComponent={<ConsoleUnavailable reason={emptyReason} />}
    />
  );
}

function consoleOpenActions(
  show: () => void,
  unsupported: boolean,
): Readonly<Partial<Record<BrowserAction, () => void>>> {
  if (!unsupported) return { console: show };
  return {
    console: show,
    'search-console': show,
    'console-level': show,
    'older-console': show,
    'new-console': show,
  };
}

function DeliveryAnnouncement({
  page,
}: {
  readonly page: PreviewDiagnosticsSnapshot['console'];
}): ReactNode {
  return (
    <View className="absolute size-px overflow-hidden" pointerEvents="none">
      <Text accessibilityLiveRegion="polite" variant="caption">
        {page.kind === 'ready' && page.delivery === 'shared'
          ? 'First error shared with this chat'
          : ''}
      </Text>
    </View>
  );
}

function PinnedConsoleLimit({ skipped }: { readonly skipped: number }): ReactNode {
  return (
    <Text variant="caption" tone="warning" className="w-full py-1">
      {skipped > 0 ? `${String(skipped)} older entries not loaded. ` : ''}Pinned console limit
      reached. New entries returns to live logs.
    </Text>
  );
}

function ConsoleResume({
  reader,
}: {
  readonly reader: ReturnType<typeof useConsoleReader>;
}): ReactNode {
  if (!reader.hasNew && !reader.limitReached) return null;
  const label = reader.hasNew ? 'New entries' : 'Return to live logs';
  return (
    <Interactive
      label={reader.hasNew ? 'New console entries' : label}
      onPress={reader.resume}
      className="min-h-touch-min justify-center"
    >
      <Text variant="caption" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

function useConsoleExpansion(snapshot: PreviewDiagnosticsSnapshot): {
  readonly expanded: boolean;
  readonly toggle: () => void;
} {
  const active = useBrowserActionScope();
  const [expanded, setExpanded] = useState(false);
  const show = (): void => {
    setExpanded(true);
  };
  useRequestedBrowserAction(consoleOpenActions(show, snapshot.console.kind === 'unavailable'));
  const { browserAction } = useLocalSearchParams<{ browserAction?: string }>();
  if (
    active &&
    !expanded &&
    browserAction !== undefined &&
    ['search-console', 'console-level', 'older-console', 'new-console'].includes(browserAction)
  )
    setExpanded(true);
  return {
    expanded,
    toggle: (): void => {
      setExpanded(!expanded);
    },
  };
}
function ConsoleBody({
  expanded,
  region,
  snapshot,
  controller,
}: {
  readonly expanded: boolean;
  readonly region: string;
  readonly snapshot: PreviewDiagnosticsSnapshot;
  readonly controller: PreviewDiagnostics;
}): ReactNode {
  const frame = expanded ? undefined : ({ display: 'none' } as const);
  return (
    <View nativeID={region} style={frame} className="min-h-0 flex-1">
      {snapshot.console.kind === 'unavailable' ? (
        <ConsoleUnavailable reason={snapshot.console.reason} />
      ) : (
        <ConsoleEntries
          key={`${snapshot.console.documentId}:${snapshot.console.epoch}`}
          page={snapshot.console}
          controller={controller}
        />
      )}
    </View>
  );
}
