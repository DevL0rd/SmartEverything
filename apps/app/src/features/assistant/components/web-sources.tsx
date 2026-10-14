import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { hostOf } from '../../../format/text';
import type { NumberedSource } from '../model/web-sources';

function SourceLink({ number, source }: NumberedSource): ReactNode {
  const host = hostOf(source.url) ?? source.url;
  const title = source.title === '' ? host : source.title;
  return (
    <Interactive
      label={`Source ${String(number)}: ${title}, ${host}`}
      hint="Opens the page in your browser"
      role="link"
      onPress={() => {
        void Linking.openURL(source.url);
      }}
      className="min-h-touch-min min-w-0 flex-row items-center gap-2 rounded-sm px-1"
      layerClassName="rounded-sm"
    >
      <Text variant="caption" tone="variant" className="w-5 tabular">
        {String(number)}
      </Text>
      <View className="min-w-0 flex-1">
        <Text variant="footnote" numberOfLines={2}>
          {title}
        </Text>
        {title === host ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {host}
          </Text>
        )}
      </View>
      <Icon name="externalLink" size={16} tone="variant" />
    </Interactive>
  );
}

export function WebSources({
  sources,
}: {
  readonly sources: readonly NumberedSource[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <View className="min-w-0 gap-0.5">
      <View className="min-h-touch-min max-w-full justify-center self-start">
        <Interactive
          label={`Sources, ${String(sources.length)}`}
          checked={open}
          hint={open ? 'Hide sources' : 'Show source titles and links'}
          hitSlop={10}
          onPress={() => {
            setOpen(!open);
          }}
          className="min-h-6 flex-row items-center gap-1.5 self-start rounded-sm px-1"
          layerClassName="rounded-sm"
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
          <Text variant="caption" tone="variant">
            Sources · {String(sources.length)}
          </Text>
        </Interactive>
      </View>
      {open ? (
        <View className="pl-4">
          {sources.map((entry) => (
            <SourceLink key={`${String(entry.number)}:${entry.source.url}`} {...entry} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
