import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { notify } from '../../../components/toast-store';
import type { AiModelSearchSource, AiModelSearchSort } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import type { SearchModelPages } from './model-search-queries';
export function openSourceWebsite(url: string): void {
  void Linking.openURL(url).catch((error: unknown) => {
    notify({ message: 'Source website could not be opened', tone: 'critical', error });
  });
}
function sourceNote(source: AiModelSearchSource, sort: AiModelSearchSort): string {
  if (source.status === 'unavailable') return 'Ranking unavailable';
  const order = source.status === 'stale' ? 'Saved OpenRouter order' : 'OpenRouter order';
  return `${order} · ${sort === 'intelligence' ? 'scores unavailable' : 'response times unavailable'}`;
}
function SourceDetails({ source }: { readonly source: AiModelSearchSource }): ReactNode {
  return (
    <View className="gap-1 rounded-md bg-surface-2 p-3">
      <Text
        variant="caption"
        tone="variant"
      >{`${source.source} · upstream order · ${source.status}`}</Text>
      <Text variant="caption" tone="variant">
        {source.coverage === 'scored-models'
          ? 'Coverage: scored models'
          : 'Coverage: upstream catalogue'}
      </Text>
      <Text
        variant="caption"
        tone="variant"
      >{`Checked: ${source.checked_at ?? 'unknown'} · Benchmark date: ${source.as_of ?? 'unknown'}`}</Text>
      {source.total === null ? null : (
        <Text variant="caption" tone="variant">{`${String(source.total)} covered models`}</Text>
      )}
      {source.version === null ? null : (
        <Text variant="caption" tone="variant">{`Version: ${source.version}`}</Text>
      )}
      {source.error === null ? null : (
        <Text variant="caption" tone="warning">
          {source.error}
        </Text>
      )}
      <Button
        label="Source website"
        onPress={(): void => {
          openSourceWebsite(source.source_url);
        }}
        variant="text"
      />
    </View>
  );
}
export function ModelSearchSource({
  pages,
  sort,
  details,
  toggle,
}: {
  readonly pages: SearchModelPages;
  readonly sort: AiModelSearchSort;
  readonly details: boolean;
  readonly toggle: () => void;
}): ReactNode {
  if (sort !== 'intelligence' && sort !== 'latency') return null;
  const source = pages.snapshot?.sources[sort];
  if (source === undefined) return null;
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant" accessibilityLiveRegion="polite">
        {sourceNote(source, sort)}
      </Text>
      <View className="flex-row flex-wrap">
        <Button
          label={details ? 'Hide source details' : 'Source details'}
          variant="text"
          onPress={toggle}
        />
        {source.status === 'unavailable' ? (
          <Button label="Retry ranking" variant="text" onPress={pages.retry} />
        ) : null}
      </View>
      {details ? <SourceDetails source={source} /> : null}
    </View>
  );
}
