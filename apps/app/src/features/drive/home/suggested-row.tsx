import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveSuggestion } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { ErrorState } from '../../../components/error-state';
import { HScroller } from '../../../components/h-scroller';
import { Section, SectionAction } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { flattenPages, useDriveSuggested } from '../data';
import { useByName } from '../components/use-by-name';
import { suggestionsInDrive } from '../priority/priority-model';
import { SuggestionCard, suggestionKeyOf } from '../priority/suggestion-card';

const PLACEHOLDERS = ['a', 'b', 'c'] as const;

function SuggestedSkeleton(): ReactNode {
  return (
    <View aria-busy className="flex-row gap-grid-gap overflow-hidden">
      {PLACEHOLDERS.map((key) => (
        <Skeleton key={key} shape="tile" className="h-16 w-68" />
      ))}
    </View>
  );
}

function SuggestedBody({
  query,
  suggestions,
}: {
  readonly query: ReturnType<typeof useDriveSuggested>;
  readonly suggestions: readonly DriveSuggestion[];
}): ReactNode {
  const nameOf = useByName();
  if (query.data !== undefined) {
    return (
      <HScroller label="Suggested files" fade>
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestionKeyOf(suggestion)}
            suggestion={suggestion}
            nameOf={nameOf}
          />
        ))}
      </HScroller>
    );
  }
  if (!query.isError) return <SuggestedSkeleton />;
  return (
    <ErrorState
      error={query.error}
      retry={() => {
        background(query.refetch(), 'drive.suggested_refetch_failed');
      }}
    />
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
