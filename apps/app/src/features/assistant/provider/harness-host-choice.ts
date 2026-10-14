import { useDesktopHarness } from '../data/desktop-harness';
import { useState } from 'react';
import { useValue } from '../../../design/external-store';
import {
  harnessTargetKey,
  type AiHarnessCatalogue,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select';
import { harnessHostReason } from '../model/harness-context';
import { usePickerSession } from '../picker/model-search-session';
import { draftHostChoice } from '../data/draft-engine';

export const COMPUTER_HOST_KEY = 'unavailable-computer';

interface HostChoice {
  readonly key: string;
  readonly draft: boolean;
  readonly valid: () => boolean;
  readonly options: readonly SelectOption<string>[];
  readonly select: (key: string) => void;
}
export function useHarnessHostChoice(
  catalogue: AiHarnessCatalogue | undefined,
  initial: AiHarnessTarget | null,
  draft = false,
): HostChoice {
  const authority = usePickerSession();
  const desktop = useDesktopHarness();
  const [selected, select] = useState<string | null>(null);
  const draftSelected = useValue(draftHostChoice);
  let key = initial === null ? (selected ?? 'server') : harnessTargetKey(initial);
  if (draft) key = draftHostKey(draftSelected, desktop);
  return {
    key,
    draft,
    valid: (): boolean => authority.valid() && (!draft || draftHostChoice.get() === draftSelected),
    select: (next): void => {
      if (!authority.valid() || (draft && draftHostChoice.get() !== draftSelected)) return;
      if (!draft) select(next);
      else draftHostChoice.set(next);
    },
    options: [...harnessHostOptions(catalogue), ...unavailableComputerOption(draft, desktop)],
  };
}
function draftHostKey(
  selected: string | null,
  desktop: ReturnType<typeof useDesktopHarness>,
): string {
  if (selected === null && desktop.desktop)
    return desktop.target === null ? COMPUTER_HOST_KEY : harnessTargetKey(desktop.target);
  if (selected === null) return 'server';
  return selected;
}
export function harnessHostOptions(
  catalogue: AiHarnessCatalogue | undefined,
): readonly SelectOption<string>[] {
  return (
    catalogue?.hosts.map((host) => {
      const reason = harnessHostReason(host);
      return {
        value: harnessTargetKey(host.target),
        label: host.name,
        description: reason ?? host.platform,
        disabled: reason !== null,
      };
    }) ?? []
  );
}

function unavailableComputerOption(
  draft: boolean,
  desktop: ReturnType<typeof useDesktopHarness>,
): readonly SelectOption<string>[] {
  return draft && desktop.desktop && desktop.target === null
    ? [
        {
          value: COMPUTER_HOST_KEY,
          label: 'This computer',
          description: 'Runtime unavailable',
          disabled: true,
        },
      ]
    : [];
}
