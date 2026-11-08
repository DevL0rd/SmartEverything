import { createElement, type ReactNode, type useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { createMcpToken } from '../../../api/access';
import type { ButtonProps } from '../../../components/button';
import type { TextFieldProps } from '../../../components/text-field';

const fixture = vi.hoisted(() => ({
  name: '',
  live: true,
  submit: vi.fn<(work: () => Promise<string>) => void>(),
  create: vi.fn<typeof createMcpToken>(),
  field: vi.fn<(props: TextFieldProps) => null>(() => null),
  button: vi.fn<(props: ButtonProps) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react', async (original) => {
  const actual = await original<{ readonly useState: typeof useState }>();
  return {
    ...actual,
    useState: (initial: unknown): ReturnType<typeof useState<unknown>> =>
      actual.useState(initial === '' ? fixture.name : initial),
  };
});
vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../api/access', () => ({ createMcpToken: fixture.create }));
vi.mock('../../../components/banner', () => ({ Banner: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: fixture.button }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/code', () => ({ CodeBlock: (): null => null }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/grid', () => ({ useGridLayout: (): null => null }));
vi.mock('../../../components/list-row', () => ({ ListRow: (): null => null }));
vi.mock('../../../components/section', () => ({ List: childrenOf }));
vi.mock('../../../components/sheet', () => ({
  Sheet: ({
    children,
    footer,
  }: {
    readonly children: ReactNode;
    readonly footer: ReactNode;
  }): ReactNode => [children, footer],
}));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../components/text-field', () => ({ TextField: fixture.field }));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: (): null => null }));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => false }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({ useRows: (): readonly [] => [] }));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): {
    readonly busy: boolean;
    readonly problem: null;
    readonly run: typeof fixture.submit;
  } => ({
    busy: false,
    problem: null,
    run: fixture.submit,
  }),
}));
vi.mock('./read-only-row', () => ({ ReadOnlyRow: (): null => null }));
vi.mock('./revoke-access', () => ({
  useHubLive: (): boolean => fixture.live,
  useOfflineBanner: (): undefined => undefined,
}));

const { TokensScreen } = await import('./tokens-screen');

function renderDraft(name: string, live: boolean): void {
  fixture.name = name;
  fixture.live = live;
  fixture.field.mockClear();
  fixture.button.mockClear();
  fixture.submit.mockClear();
  renderToStaticMarkup(createElement(TokensScreen));
}

describe('Personal token submission', () => {
  it.each([
    { name: '   ', live: true },
    { name: 'x'.repeat(81), live: true },
    { name: 'Fixture app', live: false },
  ])('ignores Enter when the Create button is disabled', ({ name, live }) => {
    renderDraft(name, live);

    expect(fixture.button).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Create', disabled: true }),
      undefined,
    );
    fixture.field.mock.calls[0]?.[0].onSubmit?.();
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it('submits a valid name from the keyboard with the existing access default', async () => {
    const name = 'x'.repeat(80);
    renderDraft(` ${name} `, true);

    expect(fixture.button).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Create', disabled: false }),
      undefined,
    );
    fixture.field.mock.calls[0]?.[0].onSubmit?.();
    expect(fixture.submit).toHaveBeenCalledOnce();
    await fixture.submit.mock.calls[0]?.[0]();
    expect(fixture.create).toHaveBeenCalledWith(name, 'control');
  });
});
