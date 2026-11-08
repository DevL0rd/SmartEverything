import { ENGINE } from '@smarteverything/domain';
import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interactive } from '../../../components/interactive';
import type { Text } from '../../../components/text';
import { ChoiceRows, type ComputerOption } from './draft-engine-choices';

const { pressable, text } = vi.hoisted(() => ({
  pressable: vi.fn<(props: ComponentProps<typeof Interactive>) => void>(),
  text: vi.fn<(props: ComponentProps<typeof Text>) => void>(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/brand-glyphs', () => ({ BrandGlyph: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: (props: ComponentProps<typeof Interactive>): ReactNode => {
    pressable(props);
    return props.children;
  },
}));
vi.mock('../../../components/text', () => ({
  Text: (props: ComponentProps<typeof Text>): null => {
    text(props);
    return null;
  },
}));

const COMPUTER = '00000000-0000-4000-8000-000000000001';
const ENGINE_DRAFT = ENGINE.parse({
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: COMPUTER,
  model: 'default',
});
const READY: ComputerOption = {
  target: { runtime: 'codex', deviceId: COMPUTER },
  name: 'Laptop',
  needsFolder: true,
};
const NO_COMPUTERS = 'No connected computers supply this engine.';

let root: Root;
const select = vi.fn();
const setPage = vi.fn();

function render(
  options: readonly ComputerOption[],
  page: ComponentProps<typeof ChoiceRows>['page'] = { kind: 'engines' },
  reason: string | null = null,
): void {
  act(() => {
    root.render(
      createElement(ChoiceRows, {
        page,
        state: { options, reason },
        engine: ENGINE_DRAFT,
        select,
        setPage,
        coordinator: vi.fn(),
      }),
    );
  });
}

function press(label: string): void {
  const row = pressable.mock.calls.findLast(([props]) => props.label === label)?.[0];
  if (row?.onPress === undefined || row.disabled === true) {
    throw new Error(`Expected a press handler for ${label}.`);
  }
  const activate = row.onPress;
  act(activate);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (): number => 1);
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('new chat engine choices', () => {
  it('explains why an engine has no computer to choose', () => {
    render([]);
    press(`Codex, ${NO_COMPUTERS}`);
    expect(pressable).toHaveBeenLastCalledWith(expect.objectContaining({ expanded: true }));
    expect(text).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessibilityLiveRegion: 'polite', children: NO_COMPUTERS }),
    );
    expect(select).not.toHaveBeenCalled();
    expect(setPage).not.toHaveBeenCalled();
  });

  it('selects a ready computer on the first press', () => {
    render([READY]);
    press('Codex, 1 computer');
    expect(select).toHaveBeenCalledExactlyOnceWith(READY);
  });

  it('opens computer choices when multiple suppliers are ready', () => {
    render([
      READY,
      {
        ...READY,
        name: 'Desk',
        target: { ...READY.target, deviceId: '00000000-0000-4000-8000-000000000002' },
      },
    ]);
    press('Codex, 2 computers');
    expect(setPage).toHaveBeenCalledExactlyOnceWith({ kind: 'computers', runtime: 'codex' });
    expect(select).not.toHaveBeenCalled();
  });

  it('selects an offline or turned-off computer from the computer choices', () => {
    const turnedOff = { ...READY, configured: false, detail: 'Provider turned off' };
    render([turnedOff], { kind: 'computers', runtime: 'codex' });
    press('Laptop, Provider turned off');
    expect(select).toHaveBeenCalledExactlyOnceWith(turnedOff);
  });
});
