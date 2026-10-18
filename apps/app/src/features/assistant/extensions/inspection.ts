import { useState } from 'react';
import { useRouter } from 'expo-router';
import { API_ENDPOINTS as E, type HarnessExtensionCandidate } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import { extensionBrowseHref } from './links';

type PageKind = 'skill' | 'extension';

function candidateKind(candidate: HarnessExtensionCandidate): PageKind {
  return candidate.kind === 'skill' ? 'skill' : 'extension';
}

function destination(
  candidates: readonly HarnessExtensionCandidate[],
  current: PageKind,
): PageKind | null {
  const kinds = candidates.map(candidateKind);
  if (kinds.includes(current)) return current;
  return kinds[0] ?? null;
}

export function useSkillInspection(kind: PageKind): {
  readonly request: TextEditRequest | null;
  readonly open: () => void;
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const look = async (url: string): Promise<void> => {
    const resolution = await api().call(E.resolveAiHarnessSkill, { body: { url } });
    const target = destination(resolution.candidates, kind);
    if (target === null) throw new Error('No skills or plugins were found at that link.');
    router.push(extensionBrowseHref(target, url));
  };
  return {
    request: open
      ? {
          title: 'Add from a link',
          label: 'Git or GitHub link',
          initial: '',
          placeholder: 'https://github.com/owner/repo',
          confirmLabel: 'Look inside',
          maxLength: 2048,
          kind: 'url',
          helper:
            'Any git repository, GitHub folder or marketplace. Looking inside installs nothing.',
          save: look,
        }
      : null,
    open: (): void => {
      setOpen(true);
    },
    close: (): void => {
      setOpen(false);
    },
  };
}
