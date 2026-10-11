import type { ReactNode } from 'react';
import { Linking, ScrollView } from 'react-native';
import {
  WEB_SOURCES_EMBED,
  type AssistantMessageRow,
  type WebSource,
  type WebSourcesEmbed,
} from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { hostOf } from '../../../format/text';

const PARSED = new WeakMap<object, WebSourcesEmbed | null>();

function parsedSources(embeds: AssistantMessageRow['embeds']): WebSourcesEmbed | null {
  for (const embed of embeds) {
    const parsed = WEB_SOURCES_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

export function webSourcesOf(row: AssistantMessageRow): WebSourcesEmbed | null {
  const known = PARSED.get(row.embeds);
  if (known !== undefined) {
    return known;
  }
  const found = parsedSources(row.embeds);
  PARSED.set(row.embeds, found);
  return found;
}

function nameOf(source: WebSource): string {
  return hostOf(source.url) ?? source.title;
}

function describe(source: WebSource): string {
  const host = nameOf(source);
  return source.title === '' || source.title === host ? host : `${source.title}, ${host}`;
}

export function WebSources({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const embed = webSourcesOf(row);
  if (embed === null) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Sources"
      className="-mx-gutter grow-0"
      contentContainerClassName="gap-2 px-gutter py-1"
    >
      {embed.sources.map((source) => (
        <Interactive
          key={source.url}
          label={`Source: ${describe(source)}`}
          hint="Opens the page in your browser"
          onPress={() => {
            void Linking.openURL(source.url);
          }}
          className="min-h-touch-min max-w-64 flex-row items-center gap-1.5 rounded-full border border-outline px-3"
          layerClassName="rounded-full"
        >
          <Icon name="globe" size={16} tone="variant" />
          <Text variant="label" numberOfLines={1} className="shrink">
            {nameOf(source)}
          </Text>
        </Interactive>
      ))}
    </ScrollView>
  );
}
