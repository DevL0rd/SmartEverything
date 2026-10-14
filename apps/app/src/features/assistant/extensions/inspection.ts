import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  HARNESS_SKILL_RESOLVE,
  HARNESS_ARTIFACT_INTEGRITY,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import { RESOLVED_EXTENSION_KEY } from './queries';
import { extensionHref } from './links';

function sourceProblem(url: string): string | null {
  return HARNESS_SKILL_RESOLVE.safeParse({ url }).success
    ? null
    : 'Use a public raw.githubusercontent.com link pinned to a full commit, ending in SKILL.md or .json.';
}

export function useSkillInspection(): {
  readonly request: TextEditRequest | null;
  readonly open: () => void;
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<string | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  const inspect = async (url: string, integrity?: string): Promise<void> => {
    const item = await api().call(E.resolveAiHarnessSkill, {
      body: { url, ...(integrity === undefined ? {} : { integrity }) },
    });
    client.setQueryData([...RESOLVED_EXTENSION_KEY, item.id], item);
    router.push(extensionHref(item.id, undefined, true));
  };
  const request =
    bundle === null
      ? linkRequest(async (url): Promise<void> => {
          if (url.endsWith('.json')) setBundle(url);
          else await inspect(url);
        })
      : integrityRequest(bundle, inspect);
  return {
    request: open || bundle !== null ? request : null,
    open: (): void => {
      setOpen(true);
    },
    close: (): void => {
      setOpen(false);
      if (bundle !== null) setBundle(null);
    },
  };
}

function linkRequest(save: (url: string) => Promise<void>): TextEditRequest {
  return {
    title: 'Inspect a skill from a link',
    label: 'Pinned skill link',
    initial: '',
    placeholder: 'https://raw.githubusercontent.com/owner/repo/commit/skill/SKILL.md',
    confirmLabel: 'Inspect',
    maxLength: 4096,
    kind: 'url',
    helper:
      'A public GitHub SKILL.md folder or bounded JSON skill bundle. Inspection does not install it or grant access.',
    problemOf: sourceProblem,
    save,
  };
}

function integrityRequest(
  url: string,
  inspect: (url: string, integrity?: string) => Promise<void>,
): TextEditRequest {
  return {
    title: 'Verify the skill bundle',
    label: 'Bundle integrity',
    initial: '',
    placeholder: 'sha256-…',
    confirmLabel: 'Inspect',
    maxLength: 200,
    helper:
      'Use the publisher’s SHA-256, SHA-384 or SHA-512 integrity for this pinned JSON bundle.',
    problemOf: (value) =>
      HARNESS_ARTIFACT_INTEGRITY.safeParse(value).success
        ? null
        : 'Enter a valid sha256, sha384 or sha512 integrity value.',
    save: (integrity) => inspect(url, integrity),
  };
}
