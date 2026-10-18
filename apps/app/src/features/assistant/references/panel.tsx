import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../../components/button';
import { KeyboardListbox } from '../../../components/keyboard-list';
import { SuggestionPanel } from '../components/suggestion-panel';
import { SuggestionGroup, SuggestionReason, SuggestionRow } from '../components/suggestion-rows';
import { referenceIcon, referenceKey, REFERENCE_SECTIONS } from './presentation';
import type { ReferenceSearch } from './search';

const PAGE_EDGE = 80;

export interface ReferencePanelProps {
  readonly search: ReferenceSearch;
  readonly choose: (key: string) => void;
  readonly inline?: boolean;
}

export function ReferencePanel({ search, choose, inline = false }: ReferencePanelProps): ReactNode {
  return (
    <SuggestionPanel inline={inline}>
      <ScrollView
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={100}
        onScroll={(event): void => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - PAGE_EDGE)
            search.next();
        }}
      >
        {search.items.length === 0 ? null : (
          <KeyboardListbox>
            <ReferenceRows search={search} choose={choose} />
          </KeyboardListbox>
        )}
        <ReferenceStatus search={search} />
        {search.more && !search.loadingMore ? (
          <Button label="Load more references" variant="text" onPress={search.next} />
        ) : null}
      </ScrollView>
    </SuggestionPanel>
  );
}

function ReferenceRows({
  search,
  choose,
}: Pick<ReferencePanelProps, 'search' | 'choose'>): ReactNode {
  const sections = [
    ...new Set(search.items.map((item) => REFERENCE_SECTIONS[item.reference.kind])),
  ];
  return sections.map((section) => (
    <SuggestionGroup key={section} label={section}>
      {search.items
        .filter((item) => REFERENCE_SECTIONS[item.reference.kind] === section)
        .map((item) => (
          <SuggestionRow
            key={referenceKey(item.reference)}
            id={referenceKey(item.reference)}
            icon={referenceIcon(item.reference)}
            title={item.label}
            subtitle={item.subtitle}
            detail={item.description}
            onChoose={choose}
          />
        ))}
    </SuggestionGroup>
  ));
}

function ReferenceStatus({ search }: { readonly search: ReferenceSearch }): ReactNode {
  const unavailable = search.sources.filter((source) => source.state === 'unavailable');
  const { reason } = search;
  return (
    <View accessibilityLiveRegion="polite">
      {reason === null ? null : (
        <SuggestionReason
          icon={reason.kind === 'offline' ? 'wifiOff' : 'info'}
          text={reason.text}
          action={
            reason.kind === 'unsupported'
              ? {
                  label: 'Choose another model',
                  onPress: (): void => {
                    router.setParams({ operation: 'model' });
                  },
                }
              : null
          }
        />
      )}
      {search.pending || search.loadingMore ? (
        <SuggestionReason icon="loader" text="Finding references…" />
      ) : null}
      {!search.pending && reason === null && search.items.length === 0 ? (
        <SuggestionReason icon="search" text="No references match." />
      ) : null}
      {unavailable.map((source) => (
        <SuggestionReason
          key={source.kind}
          icon="info"
          text={`${REFERENCE_SECTIONS[source.kind]} · ${source.reason ?? 'unavailable right now'}`}
        />
      ))}
      {search.incomplete ? (
        <SuggestionReason
          icon="info"
          text="More results may be available. Refine the name to narrow the search."
        />
      ) : null}
    </View>
  );
}
