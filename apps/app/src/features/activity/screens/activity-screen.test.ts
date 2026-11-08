import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { SelectProps } from '../../../components/select';
import type { VirtualListProps } from '../../../components/virtual-list';
import type { ActivityCategory } from '../model/atoms';
import type { ActivityItem } from '../model/coalesce';
import { ActivityScreen } from './activity-screen';

type Shown = ActivityCategory | 'all';

const state = vi.hoisted(() => ({
  items: new Array<ActivityItem>(),
  visible: new Array<string>(),
  selector: vi.fn<(props: SelectProps<Shown>) => void>(),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../../components/screen', () => ({ Screen: childrenOf }));
vi.mock('../../../components/select', () => ({
  Select: (props: SelectProps<Shown>): null => {
    state.selector(props);
    return null;
  },
}));
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: ({ header, sections }: VirtualListProps<ActivityItem>): ReactNode => {
    state.visible = sections.flatMap((section) => section.data.map((item) => item.id));
    return header;
  },
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => Date.parse(AT) }));
vi.mock('../../../store/selectors', () => ({
  useSettings: (): { readonly time_zone: string } => ({ time_zone: 'UTC' }),
}));
vi.mock('../components/activity-row', () => ({ ActivityRow: (): null => null }));
vi.mock('../data/use-activity', () => ({
  CATEGORY_LABELS: { devices: 'Devices', automations: 'Automations' },
  categoriesOf: (items: readonly ActivityItem[]): readonly ActivityCategory[] => [
    ...new Set(items.map((item) => item.category)),
  ],
  useActivity: (): readonly ActivityItem[] => state.items,
}));

const AT = '2026-11-06T03:00:00.000Z';

function item(id: string, category: ActivityCategory): ActivityItem {
  return {
    id,
    category,
    at: AT,
    since: AT,
    deviceId: null,
    name: id,
    summary: 'Updated',
    by: null,
    icon: 'activity',
    tone: 'primary',
    count: 1,
    failed: false,
  };
}

describe('Home Activity filter', () => {
  it('shows remaining activity when the last item in the selected category disappears', () => {
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
    const device = item('device', 'devices');
    const automation = item('automation', 'automations');
    const render = (...items: readonly ActivityItem[]): void => {
      state.items = [...items];
      act(() => {
        root.render(createElement(ActivityScreen));
      });
    };
    try {
      render(device, automation);
      const picker = state.selector.mock.lastCall?.[0];
      if (picker === undefined) throw new Error('Activity filter did not render');
      act(() => {
        picker.onChange('automations');
      });
      expect(state.visible).toEqual(['automation']);

      render(device);
      expect(state.visible).toEqual(['device']);

      render(device, automation);
      expect(state.selector.mock.lastCall?.[0].value).toBe('all');
      expect(state.visible).toEqual(['device', 'automation']);
    } finally {
      act(() => {
        root.unmount();
      });
      vi.unstubAllGlobals();
    }
  });
});
