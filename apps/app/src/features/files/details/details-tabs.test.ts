import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NO_ABILITIES } from '../source/abilities';
import { createFixtureSource } from '../source/fixture-source';
import { COMPUTER_FULL, computerSeedOf } from '../source/fixture-seeds';
import { nodeOfEntry, type FixtureNode, type FixtureOrigin } from '../source/fixture-tree';
import type { FileSource, SourceTabSpec } from '../source/types';
import type { DetailsHost } from './details-host';

interface Passed {
  readonly children?: ReactNode;
}

interface Tab {
  readonly key: string;
  readonly label: string;
}

vi.mock('react-native', () => ({
  View: ({ children }: Passed): ReactNode => createElement('div', {}, children),
  ScrollView: ({ children }: Passed): ReactNode => createElement('main', {}, children),
}));
vi.mock('../../../components/tabs-bar', () => ({
  TabsBar: ({
    items,
    active,
  }: {
    readonly items: readonly Tab[];
    readonly active: string;
  }): ReactNode =>
    createElement('nav', {}, `${items.map((item) => item.label).join(',')}|${active}`),
}));
vi.mock('./info-tab', () => ({ InfoTab: (): ReactNode => 'info-body' }));
vi.mock('./preview-tab', () => ({ PreviewTab: (): ReactNode => 'preview-body' }));

const { DetailsTabs } = await import('./details-tabs');
const { rememberTab } = await import('./tab-memory');

const PHOTO = nodeOfEntry({ key: 'photo', parentKey: 'root', name: 'Cat.jpg' });
const FOLDER = nodeOfEntry({ key: 'kitchen', parentKey: 'root', name: 'Kitchen', kind: 'folder' });

const COMMENTS: SourceTabSpec<FixtureOrigin> = {
  id: 'comments',
  label: 'Comments',
  Tab: ({ node }) => `comments-of-${node.name}`,
};

function hostOf(
  source: FileSource<FixtureOrigin>,
  abilities = COMPUTER_FULL,
): DetailsHost<FixtureOrigin> {
  return { source, abilities, act: vi.fn(), quickLook: null, close: vi.fn() };
}

const plain = createFixtureSource(computerSeedOf('linux'));
const withComments: FileSource<FixtureOrigin> = { ...plain, tabs: () => [COMMENTS] };

function render(node: FixtureNode, host: DetailsHost<FixtureOrigin>): string {
  return renderToStaticMarkup(
    createElement(DetailsTabs<FixtureOrigin>, { node, host, pane: true }),
  );
}

describe('DetailsTabs', () => {
  it('shows Preview and Info for a file and opens the remembered tab', () => {
    rememberTab('preview');
    expect(render(PHOTO, hostOf(plain))).toBe(
      '<div><nav>Preview,Info|preview</nav><main>preview-body</main></div>',
    );
  });

  it('falls back to Info for a folder', () => {
    rememberTab('preview');
    expect(render(FOLDER, hostOf(plain))).toBe(
      '<div><nav>Info|info</nav><main>info-body</main></div>',
    );
  });

  it('renders a tab the source registers', () => {
    rememberTab('comments');
    expect(render(PHOTO, hostOf(withComments))).toBe(
      '<div><nav>Preview,Info,Comments|comments</nav><main>comments-of-Cat.jpg</main></div>',
    );
    expect(render(PHOTO, hostOf(plain))).toContain('|info');
  });

  it('shows no tab where the source has no details', () => {
    rememberTab('info');
    expect(render(PHOTO, hostOf(withComments, NO_ABILITIES))).toBe('');
  });
});
