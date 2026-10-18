import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner } from '../components/banner';
import { Button } from '../components/button';
import { EmptyState } from '../components/empty-state';
import { ListRow } from '../components/list-row';
import { SearchField } from '../components/search-field';
import { List } from '../components/section';
import { Segmented } from '../components/segmented';
import { Select } from '../components/select';
import { Sheet } from '../components/sheet';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import { appPlatform, isMacLike } from '../design/platform';
import { useQuickAskKeys } from '../features/assistant';
import {
  SHORTCUTS,
  SHORTCUT_SCOPES,
  chordParts,
  filteredShortcuts,
  reservedKeys,
  type Shortcut,
  type ShortcutFilter,
} from './shortcuts';

type Layout = 'mac' | 'other';

const LAYOUTS = [
  { value: 'mac', label: 'Mac' },
  { value: 'other', label: 'Windows and Linux' },
] as const;

const SCOPE_OPTIONS = [
  { value: 'All', label: 'All' },
  ...SHORTCUT_SCOPES.map((scope) => ({ value: scope, label: scope })),
] as const;

export const QUICK_ASK_ID = 'quick-ask';

export interface ShortcutHelpProps {
  readonly open: boolean;
  readonly hit: string | null;
  readonly onClose: () => void;
}

function Cap({ label, lit }: { readonly label: string; readonly lit: boolean }): ReactNode {
  return (
    <View
      className={cn(
        'min-w-6 items-center rounded-xs border border-outline px-1.5 py-0.5',
        lit && 'border-primary bg-primary-container',
      )}
    >
      <Text variant="caption" tone={lit ? 'primary' : 'variant'}>
        {label}
      </Text>
    </View>
  );
}

function Keys({
  shortcut,
  layout,
  quickAsk,
  lit,
}: {
  readonly shortcut: Shortcut;
  readonly layout: Layout;
  readonly quickAsk: string;
  readonly lit: boolean;
}): ReactNode {
  const chords =
    shortcut.id === QUICK_ASK_ID
      ? [[layout === 'mac' ? '⌘' : 'Ctrl', ...quickAsk.split(' ').slice(1)]]
      : shortcut.chords.map((chord) => chordParts(chord, layout === 'mac'));
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      {chords.map((parts) => (
        <View key={parts.join('+')} className="flex-row items-center gap-1">
          {parts.map((part) => (
            <Cap key={part} label={part} lit={lit} />
          ))}
        </View>
      ))}
    </View>
  );
}

function subtitleOf(shortcut: Shortcut): string | undefined {
  if (shortcut.alternative !== undefined) return `Or: ${shortcut.alternative}`;
  return shortcut.isNew === true ? 'New' : undefined;
}

function Groups({
  rows,
  layout,
  hit,
}: {
  readonly rows: readonly Shortcut[];
  readonly layout: Layout;
  readonly hit: string | null;
}): ReactNode {
  const quickAsk = useQuickAskKeys();
  const scopes = SHORTCUT_SCOPES.filter((scope) => rows.some((row) => row.scope === scope));
  return (
    <View className="gap-5">
      {scopes.map((scope) => (
        <List key={scope} inset title={scope}>
          {rows
            .filter((row) => row.scope === scope)
            .map((row) => {
              const subtitle = subtitleOf(row);
              return (
                <ListRow
                  key={row.id}
                  title={row.label}
                  selected={hit === row.id}
                  wrapSubtitle
                  {...(subtitle === undefined ? {} : { subtitle })}
                  trailing={
                    <Keys shortcut={row} layout={layout} quickAsk={quickAsk} lit={hit === row.id} />
                  }
                />
              );
            })}
        </List>
      ))}
    </View>
  );
}

function Notices({
  hit,
  layout,
}: {
  readonly hit: Shortcut | undefined;
  readonly layout: Layout;
}): ReactNode {
  return (
    <>
      <Banner
        tone="info"
        title="Press a shortcut to try it"
        body={
          hit === undefined
            ? 'The matching row lights up while this sheet is open.'
            : `Matched: ${hit.label}`
        }
        wrapBody
      />
      {appPlatform() === 'web' ? (
        <Banner
          tone="warning"
          title="Some browsers keep a few keys"
          body={`In a web browser, ${reservedKeys(layout === 'mac')} may not reach the app. Use the button listed beside each action instead.`}
          wrapBody
        />
      ) : null}
    </>
  );
}

export function ShortcutHelp({ open, hit, onClose }: ShortcutHelpProps): ReactNode {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ShortcutFilter>('All');
  const [layout, setLayout] = useState<Layout>(isMacLike() ? 'mac' : 'other');
  const rows = filteredShortcuts(query, scope);
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts" detents={['half', 'full']}>
      <View className="gap-4 pb-6">
        <Text variant="caption" tone="variant">
          Chat and computers
        </Text>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search shortcuts"
          variant="field"
        />
        <Select label="Where" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        <Segmented label="Keyboard layout" options={LAYOUTS} value={layout} onChange={setLayout} />
        <Notices hit={SHORTCUTS.find((row) => row.id === hit)} layout={layout} />
        {rows.length === 0 ? (
          <EmptyState
            icon="keyboard"
            title={`No shortcuts match “${query}”`}
            body="Try an action name, like “model” or “chat”."
            action={
              <Button
                label="Clear search"
                variant="text"
                onPress={() => {
                  setQuery('');
                  setScope('All');
                }}
              />
            }
          />
        ) : (
          <Groups rows={rows} layout={layout} hit={hit} />
        )}
      </View>
    </Sheet>
  );
}
