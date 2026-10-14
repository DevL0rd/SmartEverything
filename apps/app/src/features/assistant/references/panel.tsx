import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { AiReferenceSummary } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { SuggestionPanel } from '../components/suggestion-panel';
import { referenceIcon, referenceKey, REFERENCE_SECTIONS } from './presentation';
import type { useReferenceSearch } from './search';
const PAGE_EDGE = 80;
export interface ReferencePanelProps {
  readonly search: ReturnType<typeof useReferenceSearch>;
  readonly selected: string | null;
  readonly choose: (key: string) => void;
  readonly inline?: boolean;
}
export function ReferencePanel(props: ReferencePanelProps): ReactNode {
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    const visible = new Set(props.search.items.map((item) => referenceKey(item.reference)));
    for (const key of positions.current.keys())
      if (!visible.has(key)) positions.current.delete(key);
    const y = props.selected === null ? undefined : positions.current.get(props.selected);
    if (y !== undefined) scroll.current?.scrollTo({ y, animated: false });
  }, [props.selected, props.search.items]);
  return (
    <SuggestionPanel inline={props.inline === true}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={100}
        onScroll={(event): void => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - PAGE_EDGE)
            props.search.next();
        }}
      >
        <ReferenceRows
          {...props}
          record={(key, y): void => {
            positions.current.set(key, y);
          }}
        />
        <ReferenceStatus search={props.search} />
        {props.search.more && !props.search.loadingMore ? (
          <Button label="Load more references" variant="text" onPress={props.search.next} />
        ) : null}
      </ScrollView>
    </SuggestionPanel>
  );
}
function ReferenceRows({
  search,
  selected,
  choose,
  record,
}: ReferencePanelProps & {
  readonly record: (key: string, y: number) => void;
}): ReactNode {
  const sections = [
    ...new Set(search.items.map((item) => REFERENCE_SECTIONS[item.reference.kind])),
  ];
  return sections.flatMap((section) => [
    <Text key={section} variant="caption" tone="variant" className="px-4 pb-1 pt-2">
      {section}
    </Text>,
    ...search.items
      .filter((item) => REFERENCE_SECTIONS[item.reference.kind] === section)
      .map((item) => (
        <ReferenceRow
          key={referenceKey(item.reference)}
          item={item}
          selected={selected}
          choose={choose}
          record={record}
        />
      )),
  ]);
}
function ReferenceRow({
  item,
  selected,
  choose,
  record,
}: {
  readonly item: AiReferenceSummary;
  readonly selected: string | null;
  readonly choose: (key: string) => void;
  readonly record: (key: string, y: number) => void;
}): ReactNode {
  const key = referenceKey(item.reference);
  const active = key === selected;
  return (
    <View
      onLayout={(event): void => {
        record(key, event.nativeEvent.layout.y);
      }}
    >
      <Interactive
        label={`${item.label}. ${item.subtitle}`}
        selected={active}
        onPress={(): void => {
          choose(key);
        }}
        className={
          active
            ? 'min-h-touch-min flex-row items-center gap-3 bg-primary/10 px-4 py-2'
            : 'min-h-touch-min flex-row items-center gap-3 px-4 py-2'
        }
      >
        <Icon name={referenceIcon(item.reference)} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong" numberOfLines={1}>
            {item.label}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {item.subtitle}
          </Text>
          {active && item.description !== undefined ? (
            <Text variant="footnote" tone="variant" numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </Interactive>
    </View>
  );
}
function ReferenceStatus({
  search,
}: {
  readonly search: ReturnType<typeof useReferenceSearch>;
}): ReactNode {
  const unavailable = search.sources.filter((source) => source.state === 'unavailable');
  return (
    <View className="gap-1 px-4 py-2">
      {search.reason === null ? null : (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {search.reason}
        </Text>
      )}
      {search.pending || search.loadingMore ? (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          Finding references…
        </Text>
      ) : null}
      {!search.pending && search.reason === null && search.items.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No references match.
        </Text>
      ) : null}
      {unavailable.map((source) => (
        <Text key={source.kind} variant="caption" tone="variant">
          {REFERENCE_SECTIONS[source.kind]} · {source.reason}
        </Text>
      ))}
      {search.incomplete ? (
        <Text variant="caption" tone="variant">
          More results may be available. Refine the name to narrow the search.
        </Text>
      ) : null}
    </View>
  );
}
