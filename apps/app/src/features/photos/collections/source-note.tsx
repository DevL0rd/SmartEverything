import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoSource } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { SOURCE_COPY } from './copy';

export function SourceNote({ source }: { readonly source: PhotoSource }): ReactNode {
  const copy = SOURCE_COPY[source];
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-4 py-3">
      <Icon name={copy.icon} size={20} tone="variant" />
      <Text variant="footnote" className="min-w-0 flex-1 basis-60">
        {copy.note}
      </Text>
      {source === 'cameras' ? (
        <Button label="Open Cameras" variant="text" href={href.cameras()} />
      ) : null}
    </View>
  );
}
