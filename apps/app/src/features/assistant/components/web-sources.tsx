import { useMemo, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { hostOf, plural } from '../../../format/text';
import type { NumberedSource } from '../model/web-sources';

const SOURCE_INKS: readonly ColourRole[] = ['viz-6', 'viz-5', 'viz-2', 'viz-1', 'viz-3'];

export function sourceHosts(sources: readonly NumberedSource[]): readonly string[] {
  return [...new Set(sources.map(({ source }) => hostOf(source.url) ?? source.url))];
}

function sourceItem({ number, source }: NumberedSource): MenuItem {
  const host = hostOf(source.url) ?? source.url;
  const title = source.title === '' ? host : source.title;
  return {
    id: `${String(number)}:${source.url}`,
    label: title,
    ...(title === host ? {} : { description: host }),
    icon: 'globe',
    onPress: (): void => {
      background(Linking.openURL(source.url), 'url.open_failed');
    },
  };
}

function Marks({ hosts }: { readonly hosts: readonly string[] }): ReactNode {
  return (
    <View aria-hidden className="min-w-0 shrink flex-row overflow-hidden">
      {hosts.map((host, index) => (
        <View
          key={host}
          className={index === 0 ? 'rounded-full bg-bg' : '-ml-1 rounded-full bg-bg'}
        >
          <Icon
            name="globe"
            size={16}
            colour={SOURCE_INKS[index % SOURCE_INKS.length] ?? 'viz-6'}
          />
        </View>
      ))}
    </View>
  );
}

export function WebSources({
  sources,
}: {
  readonly sources: readonly NumberedSource[];
}): ReactNode {
  const items = useMemo(() => sources.map(sourceItem), [sources]);
  const hosts = useMemo(() => sourceHosts(sources), [sources]);
  const label = plural(sources.length, 'source');
  const { ref, open, menu } = useAnchoredMenu(items, 'Sources');
  if (sources.length === 0) return null;
  return (
    <>
      <Interactive
        ref={ref}
        label={label}
        hint="Shows the pages this reply used"
        hitSlop={10}
        onPress={open}
        className="h-5.5 max-w-full flex-row items-center gap-1.5 self-start rounded-sm"
        layerClassName="-mx-1 rounded-sm"
      >
        <Marks hosts={hosts} />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink-0">
          {label}
        </Text>
      </Interactive>
      {menu}
    </>
  );
}
