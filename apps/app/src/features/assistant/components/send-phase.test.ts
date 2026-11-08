import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginSend, setSendPhase, useArmedSend, useSendPhase } from './send-phase';

let root: Root;
const submitted = vi.fn();
const capture =
  vi.fn<(value: ReturnType<typeof useArmedSend>, phase: ReturnType<typeof useSendPhase>) => void>();
function Controls({ uploading = false }: { readonly uploading?: boolean }): null {
  const phase = useSendPhase('draft');
  const send = useArmedSend({
    key: 'draft',
    targetKey: 'target',
    armed: phase === 'armed',
    allowed: true,
    attachments: uploading ? null : [],
    submit: (): void => {
      if (beginSend('draft')) submitted();
    },
  });
  capture(send, phase);
  return null;
}
function controls(): ReturnType<typeof useArmedSend> {
  const current = capture.mock.lastCall?.[0];
  if (current === undefined) throw new Error('Expected send controls');
  return current;
}
function mount(uploading = false): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Controls, { uploading }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  setSendPhase('draft', null);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  setSendPhase('draft', null);
  vi.unstubAllGlobals();
});

describe('composer submission ownership', () => {
  it('submits once when two controls fire before React renders the sending state', () => {
    mount();
    const first = controls();
    act(() => {
      first.send(0);
      first.send(0);
    });
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale upload cancel action unlock an in-flight submission', () => {
    mount();
    const first = controls();
    act(() => {
      first.send(0);
      first.cancel();
      first.send(0);
    });
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-flight submission claimed when its composer remounts', () => {
    mount();
    act(() => {
      controls().send(0);
    });
    act(() => {
      root.unmount();
    });
    mount();
    act(() => {
      controls().send(0);
    });
    expect(submitted).toHaveBeenCalledTimes(1);
    act(() => {
      setSendPhase('draft', null);
      controls().send(0);
    });
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it('submits an armed upload once when its files finish', () => {
    mount(true);
    act(() => {
      controls().send(1);
      controls().send(1);
    });
    expect(submitted).not.toHaveBeenCalled();
    act(() => {
      root.render(createElement(Controls, { uploading: false }));
    });
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
