import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { BrowserMatchToggle, BrowserSearchSlot, FileBrowserHandle } from './browser-types';

function MatchToggle({ match }: { readonly match: BrowserMatchToggle }): ReactNode {
  return (
    <Segmented
      options={match.options}
      value={match.value}
      onChange={match.onChange}
      label="Look in names only, or in the text inside files too"
      size="inset"
    />
  );
}

export function shellSearchOf(search: BrowserSearchSlot): ShellSearchConfig {
  return {
    value: search.value,
    onChange: search.onChange,
    placeholder: search.placeholder,
    label: search.label,
    inputRef: search.inputRef,
    ...(search.status === null ? {} : { status: search.status }),
    ...(search.match === null || search.value === ''
      ? {}
      : { options: <MatchToggle match={search.match} /> }),
  };
}

function StatusLines({ lines }: { readonly lines: readonly string[] }): ReactNode {
  return (
    <View className="min-w-0 shrink gap-0.5">
      {lines.map((line) => (
        <Text key={line} variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {line}
        </Text>
      ))}
    </View>
  );
}

export function FilterStatus<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const { filter } = browser;
  if (!filter.active || browser.body.kind === 'noMatch' || browser.body.kind === 'searching')
    return null;
  const lines = [filter.statusLine, filter.scannedLine].filter(
    (line): line is string => line !== null,
  );
  const { stop, more } = filter;
  if (lines.length === 0 && stop === null) return null;
  return (
    <View className="min-h-11 flex-row flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-1">
      <StatusLines lines={lines} />
      {stop !== null && filter.search === 'looking' ? (
        <Button label="Stop" icon="square" variant="text" onPress={stop} />
      ) : null}
      {more !== null && filter.search === 'more' ? (
        <Button label="Find more matches" variant="text" onPress={more} />
      ) : null}
    </View>
  );
}
