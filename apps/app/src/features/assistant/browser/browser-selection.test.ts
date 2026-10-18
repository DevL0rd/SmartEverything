import { describe, expect, it } from 'vitest';
import {
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_CATALOGUE,
  type AiPreviewCatalogue,
  type AiPreviewPublication,
} from '@smarteverything/domain';
import { selectionState, type BrowserSelection } from './browser-selection';

const ID = '00000000-0000-4000-8000-0000000000';
const publication = (revision: string): AiPreviewPublication => ({
  id: `${ID}01`,
  revision: `${ID}${revision}`,
  chat_id: `${ID}03`,
  profile_id: `${ID}04`,
  target: { kind: 'device', device_id: `${ID}05` },
  generation: `${ID}06`,
  runtime_instance: `${ID}07`,
  workspace: '/work',
  title: 'App',
  source_origin: 'http://127.0.0.1:3000',
  initial_path: '/',
  expires_at: null,
});
const catalogue = (
  publications: readonly AiPreviewPublication[],
  ready = true,
): AiPreviewCatalogue =>
  AI_PREVIEW_CATALOGUE.parse({
    capability: AI_PREVIEW_CAPABILITY,
    publications,
    documents: [],
    gateway: { ready, base_domain: null, reason: null },
  });
function open(shown: AiPreviewPublication): BrowserSelection {
  return {
    kind: 'preview',
    publication: shown,
    lease: {
      publication_id: shown.id,
      revision: shown.revision,
      profile_id: shown.profile_id,
      target: shown.target,
      generation: shown.generation,
      url: 'https://p.example.net/',
      origin: 'https://p.example.net',
      expires_at: null,
    },
    target: {
      kind: 'preview',
      id: 'tab',
      url: 'https://p.example.net/',
      origin: 'https://p.example.net',
      initialPath: '/',
    },
  };
}

describe('open preview tab versus the shared catalogue', () => {
  it('stays put while the shared service is unchanged', () => {
    const shown = publication('10');
    expect(selectionState(open(shown), catalogue([shown])).kind).toBe('current');
  });

  it('reloads in place with the newer revision', () => {
    const newer = publication('11');
    const state = selectionState(open(publication('10')), catalogue([newer]));
    expect(state).toEqual({ kind: 'stale', publication: newer });
  });

  it('waits for the gateway instead of closing the tab', () => {
    const state = selectionState(open(publication('10')), catalogue([publication('11')], false));
    expect(state.kind).toBe('current');
  });

  it('shows the no-longer-shared state only when the service is gone', () => {
    const state = selectionState(open(publication('10')), catalogue([]));
    expect(state).toEqual({
      kind: 'gone',
      problem: 'This service is no longer shared with this chat.',
    });
  });

  it('leaves public tabs and unloaded catalogues alone', () => {
    expect(
      selectionState(
        { kind: 'public', target: { kind: 'public', id: 'p', url: 'https://example.com' } },
        undefined,
      ).kind,
    ).toBe('current');
    expect(selectionState(open(publication('10')), undefined).kind).toBe('current');
  });
});
