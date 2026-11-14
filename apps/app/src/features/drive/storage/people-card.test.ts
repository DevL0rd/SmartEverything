import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_USAGE } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import type { PersonUsage, UsageLine } from './usage-model';

const seen = vi.hoisted((): { quotaFor: string[] } => ({ quotaFor: [] }));

vi.mock('../../profiles', () => ({
  ProfileAvatar: ({ profile }: { readonly profile: { readonly name: string } }): ReactNode =>
    createElement('i', {}, profile.name.slice(0, 1)),
}));
vi.mock('../settings/page-storage', () => ({
  useQuotaRequest: (target: { readonly profileId: string }): object => {
    seen.quotaFor.push(target.profileId);
    return {};
  },
}));
vi.mock('../../../settings/text-edit-sheet', () => ({ TextEditSheet: (): null => null }));
vi.mock('../../../components/card', () => ({
  Card: ({
    title,
    children,
  }: {
    readonly title: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('section', { title }, children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('p', {}, children),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('./usage-meter', () => ({
  UsageMeter: (props: {
    readonly title: string;
    readonly line: UsageLine;
    readonly action?: ReactNode;
    readonly trailing?: ReactNode;
  }): ReactNode =>
    createElement(
      'article',
      {},
      `${props.title}: ${props.line.used} · ${props.line.counts}`,
      props.action,
      props.trailing,
    ),
}));

const GB = 1024 ** 3;
const ME = '00000000-0000-4000-8000-0000000000a1';
const SAM = '00000000-0000-4000-8000-0000000000b1';

const PEOPLE: readonly PersonUsage[] = [
  {
    person: { id: SAM, name: 'Sam', colour: 'rose' },
    you: false,
    usage: DRIVE_USAGE.parse({
      profileId: SAM,
      items: 4210,
      folders: 12,
      live: 38 * GB,
      versions: 0,
      trash: 0,
    }),
    quota: { known: true, bytes: 200 * GB },
  },
  {
    person: { id: ME, name: 'Dana', colour: 'aqua' },
    you: true,
    usage: DRIVE_USAGE.parse({
      profileId: ME,
      items: 1,
      folders: 0,
      live: GB,
      versions: 0,
      trash: 0,
    }),
    quota: { known: true, bytes: null },
  },
];

describe('People storage list', () => {
  it('shows each person with their totals and a Set quota action, and nothing to open', async () => {
    const { PeopleCard } = await import('./people-card');
    const html = renderToStaticMarkup(createElement(PeopleCard, { people: PEOPLE }));
    expect(html).toContain(
      `Sam: ${bytes(38 * GB)} of ${bytes(200 * GB)} · 4,210 files · 12 folders`,
    );
    expect(html).toContain('Dana (you)');
    expect(html.match(/Set quota/gu)).toHaveLength(2);
    expect(html).toContain('Totals only');
    expect(html).not.toContain('href');
    expect(html).not.toContain('Open');
    expect(seen.quotaFor).toEqual([SAM, ME]);
  });

  it('draws nothing when there is nobody to list', async () => {
    const { PeopleCard } = await import('./people-card');
    expect(renderToStaticMarkup(createElement(PeopleCard, { people: [] }))).toBe('');
  });
});
