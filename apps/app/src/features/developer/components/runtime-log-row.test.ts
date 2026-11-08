import type { RuntimeLogRow } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { InteractiveProps } from '../../../components/interactive';
import { RuntimeLogEntry } from './runtime-log-row';

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn<(props: InteractiveProps) => void>() }));

vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('span', null, children),
}));
vi.mock('../../../components/disclosure', () => ({
  CollapseBody: 'section',
  CollapseRoot: 'article',
  TurnChevron: (): null => null,
}));
vi.mock('../../../components/interactive', () => ({
  Interactive: (props: InteractiveProps): ReactNode => {
    trigger(props);
    return createElement(
      'button',
      { 'aria-label': props.label, 'aria-expanded': props.expanded },
      props.children,
    );
  },
}));
vi.mock('../../../components/code', () => ({
  CodeBlock: ({ code }: { readonly code: string }): ReactNode => createElement('pre', null, code),
}));

const record: RuntimeLogRow = {
  id: 1,
  at: '2026-11-06T01:09:42.000Z',
  source: 'hub:service',
  runtime: 'hub',
  platform: 'server',
  deviceId: null,
  component: 'server',
  level: 'error',
  scope: 'hub.server',
  event: 'request.failed',
  payload: { method: 'GET' },
  failure: { name: 'Error', message: 'Request failed to complete' },
  signature: null,
  durationMs: null,
  release: null,
  bundle: null,
  recordedAt: '2026-11-06T01:09:42.000Z',
};

it('uses the summary as the disclosure and shows complete details only when expanded', () => {
  const onToggle = vi.fn();
  const collapsed = renderToStaticMarkup(
    createElement(RuntimeLogEntry, { record, open: false, onToggle }),
  );
  expect(collapsed).toContain('aria-expanded="false"');
  expect(collapsed).toContain('Details for request.failed, error');
  expect(collapsed).toContain('hub.server · hub · server');
  expect(collapsed).not.toContain('Request failed to complete');
  expect(collapsed).not.toContain('<pre>');
  trigger.mock.lastCall?.[0].onPress?.();
  expect(onToggle).toHaveBeenCalledOnce();

  const expanded = renderToStaticMarkup(
    createElement(RuntimeLogEntry, { record, open: true, onToggle }),
  );
  expect(expanded).toContain('aria-expanded="true"');
  expect(expanded).toContain('Request failed to complete');
  expect(expanded).toContain('<pre>');
  expect(expanded).toContain('&quot;method&quot;: &quot;GET&quot;');
});
