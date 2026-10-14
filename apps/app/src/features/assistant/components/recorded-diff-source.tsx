import { useState, type ReactNode } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { Sheet } from '../../../components/sheet';
import { Button } from '../../../components/button';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { recordedSourcePage, type RecordedDiffSource } from '../model/diff-source';

function SourcePages({ source }: { readonly source: RecordedDiffSource }): ReactNode {
  const [page, setPage] = useState(0);
  const current = recordedSourcePage(source, page);
  const currentPage = Math.min(page, current.pages - 1);
  return (
    <View className="gap-3">
      <Text variant="caption" tone="variant">
        {source.label} · Characters {String(current.start)}–{String(current.end)} of{' '}
        {String(source.text.length)}
      </Text>
      <ScrollView horizontal className="min-w-0 grow-0">
        <NativeText selectable className="font-mono text-caption text-on-surface">
          {current.text}
        </NativeText>
      </ScrollView>
      <View className="flex-row items-center justify-center gap-3">
        <Button
          label="Previous source page"
          variant="text"
          disabled={currentPage <= 0}
          onPress={() => {
            setPage(currentPage - 1);
          }}
        />
        <Text variant="caption" tone="variant">
          {String(currentPage + 1)} / {String(current.pages)}
        </Text>
        <Button
          label="Next source page"
          variant="text"
          disabled={currentPage + 1 >= current.pages}
          onPress={() => {
            setPage(currentPage + 1);
          }}
        />
      </View>
    </View>
  );
}
export function RecordedDiffSourceSheet({
  path,
  sources,
  open,
  onClose,
  title = 'Recorded file source',
}: {
  readonly path: string;
  readonly sources: readonly RecordedDiffSource[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
}): ReactNode {
  const [selected, setSelected] = useState(sources[0]?.label ?? 'After');
  const source = sources.find((entry) => entry.label === selected);
  return (
    <Sheet open={open} onClose={onClose} title={title} detents={['full']} wide>
      <View className="gap-3">
        <Text variant="caption" selectable>
          {path}
        </Text>
        <Text variant="caption" tone="variant">
          Recorded when this action returned
        </Text>
        {sources.length > 1 ? (
          <Segmented
            label="Recorded source"
            options={sources.map((entry) => ({ value: entry.label, label: entry.label }))}
            value={selected}
            onChange={setSelected}
          />
        ) : null}
        {source === undefined ? (
          <Text variant="caption" tone="variant">
            Source wasn’t recorded
          </Text>
        ) : (
          <SourcePages key={source.label} source={source} />
        )}
      </View>
    </Sheet>
  );
}
