import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ChatLink } from '@smarteverything/domain';
import type { LinkView } from './link-sources';

const sync = vi.hoisted(() => ({ status: 'live' }));

const views = vi.hoisted((): { list: readonly LinkView[] } => ({ list: [] }));

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../../components/interactive', () => ({ Interactive: 'Interactive' }));
vi.mock('../../../store/store-context', () => ({
  useStoreSelector: <T>(select: (state: unknown) => T): T => select({ sync, tables: {} }),
  useEntityStore: (): { readonly get: () => object } => ({ get: () => ({}) }),
}));
vi.mock('../../../settings/env', () => ({
  useSettingEnv: (): object => ({ owner: true, platform: 'android', availability: {} }),
}));
vi.mock('./link-sources', () => ({
  linkView: (link: ChatLink): LinkView | null =>
    views.list.find((view) => view.key === link.kind) ?? null,
  mostSpecific: (list: readonly LinkView[]): readonly LinkView[] => list,
}));

const { UnavailableTile } = await import('./unavailable-tile');
const { LiveCaption } = await import('./live-caption');
const { LinkCards } = await import('./link-card');

const LINK: ChatLink = { kind: 'setting_link', setting: 'theme', value: null };

const VIEW: LinkView = {
  key: 'setting_link',
  specific: true,
  icon: 'gauge',
  title: 'Theme',
  trail: 'Settings › Appearance',
  value: 'Dark',
  href: '/settings',
  toggle: null,
};

describe('message widget lines', () => {
  it('shows an unavailable widget as one line with its subject and reason', () => {
    const markup = renderToStaticMarkup(
      createElement(UnavailableTile, {
        entry: {
          status: 'unavailable',
          key: 'k',
          subject: 'Kitchen lamp',
          reason: 'It was removed or is offline.',
          cause: null,
        },
      }),
    );
    expect(markup).toContain('Can’t show Kitchen lamp');
    expect(markup).toContain(' · It was removed or is offline.');
  });

  it('labels the live caption from the sync state', () => {
    sync.status = 'live';
    expect(renderToStaticMarkup(createElement(LiveCaption))).toContain('Live');
    sync.status = 'offline';
    const offline = renderToStaticMarkup(createElement(LiveCaption));
    expect(offline).toContain('Offline');
    expect(offline).not.toContain('>Live<');
  });

  it('renders each link as a card with title, faint trail and value', () => {
    views.list = [VIEW];
    const markup = renderToStaticMarkup(createElement(LinkCards, { links: [LINK] }));
    expect(markup).toContain('Theme');
    expect(markup).toContain('Settings › Appearance');
    expect(markup).toContain('Dark');
    expect(markup).toContain('Open Theme');
    expect(markup).not.toContain('Related</');
  });

  it('renders nothing when no link resolves', () => {
    views.list = [];
    expect(renderToStaticMarkup(createElement(LinkCards, { links: [LINK] }))).toBe('');
  });
});
