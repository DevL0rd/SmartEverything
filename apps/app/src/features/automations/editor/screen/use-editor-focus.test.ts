import { act, createElement, type ReactNode } from 'react';
import type { View } from 'react-native';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: true }));

vi.mock('../../../../design/platform', () => ({ isNative: (): boolean => native.value }));
vi.mock('../../../../design/focus-into', () => ({ focusInto: vi.fn() }));

import { focusInto } from '../../../../design/focus-into';
import { focusCard, focusFirstField, useEditorFocus } from './use-editor-focus';
import { useEditorKeys } from './use-editor-keys';

function isView(value: unknown): value is View {
  return typeof value === 'object' && value !== null;
}

const candidate: unknown = {
  querySelector: (): never => {
    throw new TypeError('undefined is not a function');
  },
};
const view = isView(candidate) ? candidate : null;

function Probe({
  target,
  run,
}: {
  readonly target: string | null;
  readonly run: () => void;
}): ReactNode {
  useEditorFocus(target, run);
  useEditorKeys(run, true);
  return null;
}

function mount(): Root {
  return createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
}

describe('editor focus on a native runtime', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(focusInto).mockClear();
  });

  it('never reaches for document or DOM elements', () => {
    native.value = true;
    vi.stubGlobal('document', undefined);
    expect(() => {
      focusCard('node-1');
    }).not.toThrow();
    expect(() => {
      focusFirstField(view);
    }).not.toThrow();
    expect(focusInto).toHaveBeenCalledTimes(1);
  });

  it('mounts the focus and key hooks on a runtime that has no DOM listeners', () => {
    native.value = true;
    vi.stubGlobal('addEventListener', undefined);
    const root = mount();
    expect(() => {
      act(() => {
        root.render(createElement(Probe, { target: 'node-1', run: (): void => undefined }));
      });
    }).not.toThrow();
    act(() => {
      root.unmount();
    });
  });

  it('listens for keys on the web and stops on unmount', () => {
    native.value = false;
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('addEventListener', add);
    vi.stubGlobal('removeEventListener', remove);
    vi.stubGlobal(
      'HTMLElement',
      class Stub {
        readonly tag = 'stub';
      },
    );
    const root = mount();
    act(() => {
      root.render(createElement(Probe, { target: null, run: (): void => undefined }));
    });
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function));
    act(() => {
      root.unmount();
    });
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
