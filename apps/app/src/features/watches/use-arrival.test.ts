import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArrival } from './use-arrival';

type Arrival = readonly [boolean, (open: boolean) => void];

const seen: { current: Arrival } = { current: [false, (): void => undefined] };

function Probe({ arriving }: { readonly arriving: boolean }): ReactNode {
  const arrival = useArrival(arriving);
  useEffect(() => {
    seen.current = arrival;
  });
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

let render: (arriving: boolean) => void = (): void => undefined;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  render = (arriving): void => {
    act(() => {
      root.render(createElement(Probe, { arriving }));
    });
  };
});

describe('the workout sheet on arrival', () => {
  it('opens when the page mounts with the start parameter', () => {
    render(true);
    expect(seen.current[0]).toBe(true);
  });

  it('opens each time the parameter arrives on a page that stays mounted', () => {
    render(false);
    expect(seen.current[0]).toBe(false);
    render(true);
    expect(seen.current[0]).toBe(true);
    act(() => {
      seen.current[1](false);
    });
    expect(seen.current[0]).toBe(false);
    render(false);
    render(true);
    expect(seen.current[0]).toBe(true);
  });

  it('stays closed after a close while the parameter is still present', () => {
    render(true);
    act(() => {
      seen.current[1](false);
    });
    render(true);
    expect(seen.current[0]).toBe(false);
  });
});
