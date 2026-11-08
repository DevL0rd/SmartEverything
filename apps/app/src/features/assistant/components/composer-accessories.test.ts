import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../../components/menu';
import { AccessoryRow } from './composer-accessories';
import { ComposerClassProvider } from './composer-accessory-layout';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'touch' }));
vi.mock('../../../components/icon-button', () => ({
  IconButton: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('../../../components/menu', () => ({
  useAnchoredMenu: (items: readonly MenuItem[]): { readonly menu: ReactNode } => ({
    menu: createElement('span', null, items.map((item) => item.label).join(', ')),
  }),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/tooltip', () => ({ Tooltip: (): null => null }));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../platform/pick-files', () => ({ pickFiles: vi.fn() }));
vi.mock('../data/uploads', () => ({ attachFiles: vi.fn() }));
vi.mock('../voice-message/voice-message-sheet', () => ({ VoiceMessageSheet: (): null => null }));
vi.mock('./composer-chip', () => ({ ComposerChip: (): null => null }));
vi.mock('./composer-send', () => ({
  SendControls: (): ReactNode => createElement('button', null, 'Send message'),
}));

describe('composer actions', () => {
  it.each(['regular', 'tight'] as const)(
    'places one voice button immediately before Send in the %s composer',
    (composerClass) => {
      const markup = renderToStaticMarkup(
        createElement(
          ComposerClassProvider,
          { value: composerClass },
          createElement(AccessoryRow, {
            config: { disabled: false, placeholder: 'Message', send: vi.fn() },
            state: {
              draftKey: 'chat',
              expandable: false,
              setEditor: vi.fn(),
              mode: 'send',
              ring: 0,
              send: vi.fn(),
            },
          }),
        ),
      );
      expect(markup).toContain('<button>Attach</button><span>Take a photo, Photos, Files</span>');
      expect(markup).toContain('<button>Voice message</button><button>Send message</button>');
      expect(markup.match(/Voice message/g)).toHaveLength(1);
      expect(markup).not.toContain('Emoji');
    },
  );
});
