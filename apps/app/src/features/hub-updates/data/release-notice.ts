import { useEffect, useState } from 'react';
import type { HubUpdateRecoveryStatus } from '@smarteverything/domain';
import { localPref, setLocalPref } from '../../../store/local-prefs';
import { releaseNoticeOf, releaseOutcomeOf, type ReleaseNotice } from '../model/update-copy';

export function releaseOutcomeSeen(home: string, outcomeId: string): boolean {
  return localPref('hubUpdateNotices')[home]?.includes(outcomeId) === true;
}

export function rememberReleaseOutcome(home: string, outcomeId: string): void {
  const notices = localPref('hubUpdateNotices');
  const seen = notices[home] ?? [];
  if (!seen.includes(outcomeId)) {
    setLocalPref('hubUpdateNotices', { ...notices, [home]: [...seen, outcomeId] });
  }
}

interface Presentation {
  readonly home: string;
  readonly outcomeId: string | null;
  readonly dismissed: boolean;
}

function presentationOf(home: string, outcomeId: string | null): Presentation {
  return { home, outcomeId, dismissed: outcomeId === null || releaseOutcomeSeen(home, outcomeId) };
}

function useOutcomePresentation(
  home: string,
  outcomeId: string | null,
): { readonly dismissed: boolean; readonly onDismiss: () => void } {
  const [presented, setPresented] = useState(() => presentationOf(home, outcomeId));
  const current =
    presented.home === home && presented.outcomeId === outcomeId
      ? presented
      : presentationOf(home, outcomeId);
  if (presented !== current) setPresented(current);
  return {
    dismissed: current.dismissed,
    onDismiss: (): void => {
      setPresented({ home, outcomeId, dismissed: true });
    },
  };
}

interface ReleaseNoticeInput {
  readonly home: string;
  readonly release: HubUpdateRecoveryStatus['release'] | undefined;
  readonly starting: boolean;
  readonly live: boolean;
  readonly foreground: boolean;
}

export function useReleaseNotice({
  home,
  release,
  starting,
  live,
  foreground,
}: ReleaseNoticeInput): {
  readonly notice: ReleaseNotice | null;
  readonly onDismiss: (() => void) | undefined;
} {
  const progress = releaseNoticeOf(release, starting, live);
  const outcome = progress === null ? releaseOutcomeOf(release) : null;
  const outcomeId = outcome?.id ?? null;
  const { dismissed, onDismiss } = useOutcomePresentation(home, outcomeId);
  const terminal = dismissed ? null : outcome;
  const shownId = terminal?.id ?? null;
  useEffect(() => {
    if (shownId !== null && foreground) rememberReleaseOutcome(home, shownId);
  }, [home, shownId, foreground]);
  return {
    notice: terminal === null ? progress : terminal.notice,
    onDismiss: terminal === null ? undefined : onDismiss,
  };
}
