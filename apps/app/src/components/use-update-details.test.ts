import { act, createElement, useLayoutEffect, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateDetails } from './update-details';
import { useUpdateDetails, type UpdateDetailsOffer } from './use-update-details';

type Details = ComponentProps<typeof UpdateDetails>;

const rendered = vi.hoisted(() => ({
  launcher: vi.fn<(value: ReturnType<typeof useUpdateDetails>) => void>(),
  modal: vi.fn<(value: Details | null) => void>(),
}));

vi.mock('./update-details', () => ({
  UpdateDetails: (props: Details): null => {
    useLayoutEffect(() => {
      rendered.modal(props);
      return (): void => {
        rendered.modal(null);
      };
    }, [props]);
    return null;
  },
}));

function Harness({ offer }: { readonly offer: UpdateDetailsOffer | null }): ReactNode {
  const details = useUpdateDetails(offer);
  useLayoutEffect(() => {
    rendered.launcher(details);
  }, [details]);
  return details.modal;
}

const reviewed: UpdateDetailsOffer = {
  id: 'first',
  scope: 'home',
  content: { title: 'SmartEverything 1.2.3', notes: 'Reviewed offer notes.' },
  footer: { kind: 'action', actionId: 'install', label: 'Install', onPress: vi.fn() },
};

let root: Root;

function render(offer: UpdateDetailsOffer | null): void {
  act(() => {
    root.render(createElement(Harness, { offer }));
  });
}

function open(): void {
  const launch = rendered.launcher.mock.lastCall?.[0].secondaryAction?.onPress;
  if (launch === undefined) throw new Error('Expected Details to be available.');
  act(launch);
}

function modal(): Details {
  const current = rendered.modal.mock.lastCall?.[0];
  if (current == null) throw new Error('Expected Details to be open.');
  return current;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

describe('update details offer lifecycle', () => {
  it('keeps the reviewed notes and disables install after the offer or scope changes', () => {
    render(reviewed);
    open();
    expect(modal().notes).toBe('Reviewed offer notes.');
    render({ ...reviewed, id: 'replacement', content: { title: 'Replacement' } });
    expect(modal().notes).toBe('Reviewed offer notes.');
    expect(modal().footer.kind).toBe('stale');
    render({ ...reviewed, scope: 'other home' });
    expect(modal().footer.kind).toBe('stale');
    render(null);
    expect(modal().footer.kind).toBe('stale');
    expect(reviewed.footer.kind === 'action' && reviewed.footer.onPress).not.toHaveBeenCalled();
  });

  it('unmounts before invoking the latest callback for the reviewed action exactly once', () => {
    const install = vi.fn(() => {
      expect(rendered.modal.mock.lastCall?.[0]).toBeNull();
    });
    render(reviewed);
    open();
    render({
      ...reviewed,
      footer: { kind: 'action', actionId: 'install', label: 'Install', onPress: install },
    });
    const { footer } = modal();
    if (footer.kind !== 'action') throw new Error('Expected an install action.');
    act(() => {
      footer.onPress();
      footer.onPress();
    });
    expect(install).toHaveBeenCalledOnce();
  });

  it('drops a queued install if the same release changes command before the handoff', () => {
    const restart = vi.fn();
    render(reviewed);
    open();
    const { footer } = modal();
    if (footer.kind !== 'action') throw new Error('Expected an install action.');
    act(() => {
      footer.onPress();
      root.render(
        createElement(Harness, {
          offer: {
            ...reviewed,
            footer: { kind: 'action', actionId: 'restart', label: 'Restart', onPress: restart },
          },
        }),
      );
    });
    expect(reviewed.footer.kind === 'action' && reviewed.footer.onPress).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });
});
