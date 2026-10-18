import { memo, useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Disclosure } from '../../../components/disclosure';
import { hostOf } from '../../../format/text';
import type { NumberedSource } from '../model/web-sources';
import { background } from '@smarteverything/logging';

const FIRST_SOURCES = 8;

const SourceLink = memo(function SourceLink({ number, source }: NumberedSource): ReactNode {
  const host = hostOf(source.url) ?? source.url;
  const title = source.title === '' ? host : source.title;
  return (
    <Interactive
      label={`Source ${String(number)}: ${title}, ${host}`}
      hint="Opens the page in your browser"
      role="link"
      onPress={() => {
        background(Linking.openURL(source.url), 'url.open_failed');
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
});

export function WebSources({
  sources,
}: {
  readonly sources: readonly NumberedSource[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (sources.length === 0) return null;
  const shown = all ? sources : sources.slice(0, FIRST_SOURCES);
  return (
    <Disclosure
      label="Sources"
      accessibleLabel={`Sources, ${String(sources.length)}`}
      count={sources.length}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      hint={open ? 'Hide sources' : 'Show source titles and links'}
      bodyClassName="pl-4"
    >
      {shown.map((entry) => (
        <SourceLink key={`${String(entry.number)}:${entry.source.url}`} {...entry} />
      ))}
      {shown.length === sources.length ? null : (
        <Interactive
          label={`Show ${String(sources.length - shown.length)} more sources`}
          onPress={() => {
            setAll(true);
          }}
          className="min-h-touch-min justify-center self-start px-1"
        >
          <Text variant="caption" tone="primary">
            {`Show ${String(sources.length - shown.length)} more`}
          </Text>
        </Interactive>
      )}
    </Disclosure>
  );
}
