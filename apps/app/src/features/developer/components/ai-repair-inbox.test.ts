import type { AiRepairDismissal, AiRepairGroup, AiRepairPage } from '@smarteverything/domain';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ButtonProps } from '../../../components/button';
import { href } from '../../../app-shell/hrefs';
import type { RepairDiagnosisAction } from '../data/ai-repair-inbox';
import { AiRepairInbox } from './ai-repair-inbox';

interface DismissOptions {
  readonly onSuccess: (result: { readonly dismissed: number }) => void;
}

const { mutate, action, page, links, statusText } = vi.hoisted(() => ({
  mutate: vi.fn<(body: AiRepairDismissal, options: DismissOptions) => void>(),
  action: vi.fn<(label: string) => void>(),
  page: new Map<string, () => void>(),
  links: new Map<string, ButtonProps['href']>(),
  statusText: vi.fn(),
}));

const group: AiRepairGroup = {
  fingerprint: 'a'.repeat(64),
  component: 'hub.fixture',
  event: 'request.failed',
  firstAt: '2026-11-06T01:00:00.000Z',
  lastAt: '2026-11-06T01:00:00.000Z',
  observations: 2,
  latestLogId: 1,
};

let groups: readonly AiRepairGroup[] = [group];

function childrenOnly({ children }: { readonly children?: ReactNode }): ReactNode {
  return children ?? null;
}

vi.mock('react-native', () => ({ View: childrenOnly }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: (): { readonly focus: string } => ({
    focus: 'developer.error-investigations',
  }),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label, onPress, href }: ButtonProps): null => {
    action(label);
    links.set(label, href);
    if (onPress !== undefined) page.set(label, onPress);
    return null;
  },
}));
vi.mock('../../../components/card', () => ({ Card: childrenOnly }));
vi.mock('../../../components/disclosure', () => ({
  CollapseBody: childrenOnly,
  CollapseRoot: childrenOnly,
  TurnChevron: (): null => null,
}));
vi.mock('../../../components/interactive', () => ({ Interactive: (): null => null }));
vi.mock('../../../components/section', () => ({
  List: childrenOnly,
  Section: childrenOnly,
  SectionAction: (): null => null,
}));
vi.mock('../../../components/text', () => ({
  Text: (props: { readonly children?: ReactNode; readonly tone?: string }): null => {
    statusText(props);
    return null;
  },
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../data/ai-repair-inbox', () => ({
  useAiRepairGroups: (cursor: AiRepairPage['next']): { readonly data: AiRepairPage } => ({
    data:
      cursor === null
        ? { groups: [...groups], next: { fingerprint: group.fingerprint, lastAt: group.lastAt } }
        : { groups: [], next: null },
  }),
  useDiagnosisRequests: (): (() => RepairDiagnosisAction) => () => ({
    diagnose: (): void => undefined,
    pending: false,
    failed: false,
  }),
  useDismissAiRepairGroups: (): { readonly mutate: typeof mutate } => ({ mutate }),
  useRefreshAiRepairGroups: (): (() => undefined) => () => undefined,
}));

it('keeps paging above the errors and offers bulk cleanup on an empty older page', () => {
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
  try {
    act(() => {
      root.render(createElement(AiRepairInbox));
    });
    expect(action.mock.calls).toEqual([['Older'], ['Clear inactive'], ['Investigate with AI']]);
    action.mockClear();
    act(() => {
      page.get('Older')?.();
    });
    expect(action.mock.calls).toEqual([['Newer'], ['Clear inactive']]);
    act(() => {
      page.get('Clear inactive')?.();
    });
    expect(mutate.mock.lastCall?.[0]).toEqual({ kind: 'inactive' });
    action.mockClear();
    act(() => {
      mutate.mock.lastCall?.[1].onSuccess({ dismissed: 2 });
    });
    expect(action.mock.calls).toEqual([['Older'], ['Clear inactive'], ['Investigate with AI']]);
  } finally {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});

it.each(['queued', 'running'] as const)(
  'links a healthy %s investigation to its canonical chat with the normal status tone',
  (progress) => {
    const chatId = '0e000000-0000-4000-8000-0000000000c1';
    groups = [
      {
        ...group,
        progress,
        admission: {
          kind: 'existing',
          chatId,
          eventId: '0e000000-0000-4000-8000-000000000003',
        },
      },
    ];
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
    try {
      links.clear();
      statusText.mockClear();
      act(() => {
        root.render(createElement(AiRepairInbox));
      });
      expect(links.get('Open investigation')).toEqual(href.assistantChat(chatId));
      expect(links.has('Investigate with AI')).toBe(false);
      expect(statusText).toHaveBeenCalledWith(
        expect.objectContaining({
          children: progress === 'queued' ? 'Investigation queued' : 'Investigation in progress',
          tone: 'variant',
        }),
      );
    } finally {
      act(() => {
        root.unmount();
      });
      groups = [group];
      vi.unstubAllGlobals();
    }
  },
);
