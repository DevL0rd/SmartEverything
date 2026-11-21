import type { DriveRoot, DriveSuggestion } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import { relative } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useDriveRootPlaces } from '../data';
import { useByName } from '../components/use-by-name';
import { openHrefOf } from '../recent/recent-model';
import { reasonLineOf, reasonOf, type NameOf } from './priority-model';

export interface SuggestionView {
  readonly key: string;
  readonly suggestion: DriveSuggestion;
  readonly href: AppHref;
  readonly hrefKey: string;
  readonly because: string;
  readonly when: string;
  readonly line: string;
}

export function suggestionKeyOf(suggestion: DriveSuggestion): string {
  return `${suggestion.item.id}\n${suggestion.reason}\n${suggestion.at}`;
}

export function suggestionViewOf(
  suggestion: DriveSuggestion,
  nameOf: NameOf,
  roots: readonly Pick<DriveRoot, 'id' | 'scope'>[],
  now: number,
): SuggestionView {
  const href = openHrefOf(suggestion.item, roots);
  return {
    key: suggestionKeyOf(suggestion),
    suggestion,
    href,
    hrefKey: JSON.stringify(href),
    because: reasonOf(suggestion, nameOf),
    when: relative(suggestion.at, now),
    line: reasonLineOf(suggestion, nameOf, now),
  };
}

export function sameSuggestionView(left: SuggestionView, right: SuggestionView): boolean {
  return (
    left.key === right.key &&
    left.suggestion === right.suggestion &&
    left.hrefKey === right.hrefKey &&
    left.because === right.because &&
    left.when === right.when
  );
}

export function sameSuggestionViews(
  left: readonly SuggestionView[],
  right: readonly SuggestionView[],
): boolean {
  return (
    left.length === right.length &&
    left.every((view, index) => {
      const other = right[index];
      return other !== undefined && sameSuggestionView(view, other);
    })
  );
}

export function suggestionViewKeyOf(view: SuggestionView): string {
  return view.key;
}

export function useSuggestionViews(
  suggestions: readonly DriveSuggestion[],
): readonly SuggestionView[] {
  const nameOf = useByName();
  const roots = useDriveRootPlaces();
  return useMinuteOf(
    (now) => suggestions.map((suggestion) => suggestionViewOf(suggestion, nameOf, roots, now)),
    sameSuggestionViews,
  );
}
