import { useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import type { AiChatRow, BrowserConsoleMessage } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useDerived } from '../data/use-derived';
import { browserConsole, type BrowserConsoleRow } from './browser-console-store';
import type { BrowserRepair } from './browser-repair';
import { useBrowserRepair } from './use-browser-repair';

const TONE: Readonly<Record<BrowserConsoleMessage['level'], Tone>> = {
  debug: 'variant',
  info: 'variant',
  log: 'variant',
  warning: 'warning',
  error: 'critical',
};

const ignoreConsole = (): (() => void) => (): void => undefined;

function ConsoleRow({ row }: { readonly row: BrowserConsoleRow }): ReactNode {
  return (
    <View className="min-w-0 gap-0.5 border-b border-outline-variant px-3 py-1.5">
      <Text variant="caption" tone={TONE[row.level]} selectable>
        {row.level} · {row.source}:{String(row.line)}
      </Text>
      <Text variant="footnote" className="font-mono" selectable>
        {row.message}
      </Text>
    </View>
  );
}

export function BrowserConsole({
  chat,
  targetId,
  visible,
  repair,
}: {
  readonly chat: AiChatRow;
  readonly targetId: string;
  readonly visible: boolean;
  readonly repair: BrowserRepair;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const { rows, dropped } = useDerived(
    open ? browserConsole.subscribe : ignoreConsole,
    () => browserConsole.read(targetId),
    Object.is,
  );
  useBrowserRepair(chat, targetId, visible, repair);
  return (
    <View className="min-w-0 shrink-0 border-t border-outline-variant bg-surface-2">
      <View className="min-w-0 flex-row items-center px-1">
        <Interactive
          label="Browser console"
          expanded={open}
          onPress={() => {
            setOpen(!open);
          }}
          className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-2 rounded-sm px-2"
        >
          <Icon name="terminal" size={16} tone="variant" />
          <Text variant="label" className="min-w-0 flex-1">
            Console
          </Text>
          <Icon name={open ? 'chevronDown' : 'chevronUp'} size={16} tone="variant" />
        </Interactive>
        {open ? (
          <IconButton
            icon="trash"
            label="Clear console"
            disabled={rows.length === 0 && dropped === 0}
            onPress={() => {
              browserConsole.clear(targetId);
            }}
          />
        ) : null}
      </View>
      {open ? <ConsoleOutput rows={rows} dropped={dropped} /> : null}
    </View>
  );
}

function ConsoleOutput({
  rows,
  dropped,
}: {
  readonly rows: readonly BrowserConsoleRow[];
  readonly dropped: number;
}): ReactNode {
  return (
    <FlatList
      accessibilityLabel="Console output"
      className="h-36 border-t border-outline-variant bg-surface-1"
      data={[...rows].reverse()}
      keyExtractor={(row) => String(row.sequence)}
      renderItem={({ item }) => <ConsoleRow row={item} />}
      ListHeaderComponent={
        dropped === 0 ? null : (
          <Text variant="caption" tone="variant" className="px-3 py-1">
            {String(dropped)} messages outside the retained buffer
          </Text>
        )
      }
      ListEmptyComponent={
        <Text variant="footnote" tone="variant" className="px-3 py-2">
          No console messages yet.
        </Text>
      }
    />
  );
}
