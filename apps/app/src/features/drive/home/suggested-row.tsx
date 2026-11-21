import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveSuggestion } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { ErrorState } from '../../../components/error-state';
import { HList } from '../../../components/h-list';
import { Section, SectionAction } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { flattenPages, useDriveSuggested } from '../data';
import { suggestionsInDrive } from '../priority/priority-model';
import { SuggestionCard } from '../priority/suggestion-card';
import {
  suggestionViewKeyOf,
  useSuggestionViews,
  type SuggestionView,
} from '../priority/suggestion-views';

const PLACEHOLDERS = ['a', 'b', 'c'] as const;

function SuggestedSkeleton(): ReactNode {
  return (
    <View aria-busy className="flex-row gap-grid-gap overflow-hidden px-4">
      {PLACEHOLDERS.map((key) => (
        <Skeleton key={key} shape="tile" className="h-16 w-68" />
      ))}
    </View>
  );
}

function renderSuggestion(view: SuggestionView): ReactElement {
  return <SuggestionCard view={view} />;
}

function SuggestedBody({
  query,
  suggestions,
}: {
  readonly query: ReturnType<typeof useDriveSuggested>;
  readonly suggestions: readonly DriveSuggestion[];
}): ReactNode {
  const views = useSuggestionViews(suggestions);
  if (query.data !== undefined) {
    return (
      <HList
        label="Suggested files"
        data={views}
        keyOf={suggestionViewKeyOf}
        renderItem={renderSuggestion}
        fade
        inset
      />
    );
  }
  if (!query.isError) return <SuggestedSkeleton />;
  return (
    <View className="px-4">
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.suggested_refetch_failed');
        }}
      />
    </View>
  );
}

export function SuggestedRow({ rootId }: { readonly rootId: string | null }): ReactNode {
  const query = useDriveSuggested();
  const suggestions = suggestionsInDrive(
    flattenPages(query.data, (page) => page.items),
    rootId,
  );
  if (query.data !== undefined && suggestions.length === 0) return null;
  return (
    <Section
      title="Suggested"
      action={
        <SectionAction
          label="See all"
          spoken="See every suggested file in Priority"
          href={href.drivePage('priority')}
        />
      }
    >
      <SuggestedBody query={query} suggestions={suggestions} />
    </Section>
  );
}
