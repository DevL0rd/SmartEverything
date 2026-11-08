import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { createDriveAlbum } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { TimelineGrid } from '../timeline/timeline-grid';
import { TimelineLoading } from '../timeline/timeline-states';
import type { MediaActions } from '../timeline/use-media-actions';
import { NoResults } from './no-results';
import { smartRuleOf, type SearchInput } from './query';
import { resultCountText, resultMetaText } from './results';
import { searchTitleOf } from './tokens';
import type { SearchPages } from './use-search-pages';

export interface SearchResultsProps {
  readonly search: SearchInput;
  readonly pages: SearchPages;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
  readonly onClearFilters: () => void;
}

async function saveSmartAlbum(search: SearchInput): Promise<void> {
  const rule = smartRuleOf(search);
  if (rule === null) return;
  const album = await createDriveAlbum({
    kind: 'smart',
    title: searchTitleOf(search.tokens, search.text),
    surface: 'photos',
    scope: 'person',
    rule,
  });
  router.push(href.photosAlbum(album.id));
}

function SaveButton({ search }: { readonly search: SearchInput }): ReactNode {
  const [saving, setSaving] = useState(false);
  if (smartRuleOf(search) === null) return null;
  return (
    <Button
      label="Save as smart album"
      icon="sparkles"
      variant="text"
      loading={saving}
      onPress={() => {
        setSaving(true);
        saveSmartAlbum(search)
          .catch(notifyFailure('The smart album was not saved'))
          .finally(() => {
            setSaving(false);
          });
      }}
    />
  );
}

function ResultLine({
  search,
  pages,
  controls,
}: Pick<SearchResultsProps, 'search' | 'pages' | 'controls'>): ReactNode {
  const meta = resultMetaText(pages.summary);
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 px-gutter pb-2">
      <Text variant="body-strong" className="tabular">
        {resultCountText(pages.summary)}
      </Text>
      {meta === '' ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {meta}
        </Text>
      )}
      <View className="flex-1" />
      <SaveButton search={search} />
      {controls.selection.active ? null : (
        <Button label="Select all" icon="circleCheck" variant="text" onPress={controls.all} />
      )}
    </View>
  );
}

export function SearchResults(props: SearchResultsProps): ReactNode {
  const { search, pages, controls } = props;
  if (pages.state === 'loading') return <TimelineLoading />;
  if (pages.state === 'error') return <ErrorState page error={pages.error} retry={pages.retry} />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      {pages.tiles.length === 0 ? null : (
        <ResultLine search={search} pages={pages} controls={controls} />
      )}
      <TimelineGrid
        tiles={pages.tiles}
        step={props.step}
        onStep={props.onStep}
        selection={controls}
        media={props.media}
        empty={<NoResults search={search} onClearFilters={props.onClearFilters} />}
        footer={
          <View className="px-gutter">
            {pages.failedMore ? <ErrorState error={pages.error} retry={pages.retry} /> : null}
          </View>
        }
        onEnd={pages.more}
      />
    </View>
  );
}
