import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefNames } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { automation, note, start } from '../model/graph/graph-scene-fixtures';
import { useLintContext, useRefNames } from './use-environment';

interface DeviceStub {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly updated_at: string;
  readonly details: Readonly<Record<string, unknown>>;
}

interface AutomationStub {
  readonly id: string;
  readonly name: string;
  readonly definition: ReturnType<typeof automation>;
  readonly run_count: number;
  readonly last_run_at: string | null;
}

interface World {
  devices: readonly DeviceStub[];
  automations: readonly AutomationStub[];
  readonly empty: readonly never[];
  readonly none: { readonly data: readonly never[] };
  readonly settings: Readonly<Record<string, never>>;
  readonly lookup: ReadonlyMap<string, never>;
}

const world = vi.hoisted((): World => ({
  devices: [],
  automations: [],
  empty: [],
  none: { data: [] },
  settings: {},
  lookup: new Map<string, never>(),
}));

interface AutomationListStub {
  readonly rows: readonly AutomationStub[];
  readonly byId: ReadonlyMap<string, AutomationStub>;
  readonly rejected: number;
}

vi.mock('./editor-devices', () => ({
  useEditorDevices: (): readonly DeviceStub[] => world.devices,
}));
vi.mock('../../../store/selectors', () => ({
  useRooms: (): readonly never[] => world.empty,
  useRows: (): readonly never[] => world.empty,
  useIsOwner: (): boolean => true,
  useSettings: (): World['settings'] => world.settings,
}));
vi.mock('../../../store/people', () => ({ useProfiles: (): readonly never[] => world.empty }));
vi.mock('../../../queries/use-screen-query', () => ({ useScreenQuery: vi.fn() }));
vi.mock('../data/use-functions', () => ({ useFunctions: (): World['none'] => world.none }));
vi.mock('../data/use-secrets', () => ({ useSecrets: (): World['none'] => world.none }));
vi.mock('../data/source', () => ({
  useAutomationsSource: (): { readonly lookup: World['lookup'] } => ({ lookup: world.lookup }),
}));
vi.mock('../data/use-automations', () => ({
  useAutomations: (): AutomationListStub => ({
    rows: world.automations,
    byId: new Map(world.automations.map((row) => [row.id, row])),
    rejected: 0,
  }),
}));

const DEVICE = '00000000-0000-4000-8000-000000000001';
const AUTOMATION = '00000000-0000-4000-8000-000000000002';

function device(label: string, stamp: string): DeviceStub {
  return { id: DEVICE, label, kind: 'light', updated_at: stamp, details: { stamp } };
}

function automationRow(runs: number): AutomationStub {
  return {
    id: AUTOMATION,
    name: 'Evening',
    definition: automation([start('a'), note('a')]),
    run_count: runs,
    last_run_at: runs === 0 ? null : `2026-11-15T10:0${String(runs)}:00.000Z`,
  };
}

interface Seen {
  readonly names: RefNames;
  readonly lint: LintContext;
}

let root: Root | null = null;

function mount(): () => Seen {
  const seen: Seen[] = [];
  function Probe({ tick }: { readonly tick: number }): ReactNode {
    const names = useRefNames();
    const lint = useLintContext();
    seen.push({ names, lint });
    return tick < 0 ? tick : null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  return () => {
    act(() => {
      created.render(createElement(Probe, { tick: seen.length }));
    });
    const latest = seen.at(-1);
    if (latest === undefined) throw new Error('the probe did not render');
    return latest;
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  world.devices = [device('Hall light', 'a')];
  world.automations = [automationRow(0)];
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('automation environment identity', () => {
  it('keeps the names and the lint context when a device row changes only its details', () => {
    const render = mount();
    const before = render();
    world.devices = [device('Hall light', 'b')];
    const after = render();
    expect(after.names).toBe(before.names);
    expect(after.lint).toBe(before.lint);
  });

  it('keeps the names and the lint context when an automation runs', () => {
    const render = mount();
    const before = render();
    world.automations = [automationRow(1)];
    const after = render();
    expect(after.names).toBe(before.names);
    expect(after.lint).toBe(before.lint);
    expect(after.lint.automations(AUTOMATION)).toEqual(automationRow(0).definition);
  });

  it('gives new names when a device is renamed', () => {
    const render = mount();
    const before = render();
    world.devices = [device('Porch light', 'b')];
    const after = render();
    expect(after.names).not.toBe(before.names);
    expect(after.names('device', DEVICE)).toBe('Porch light');
  });

  it('gives a new lint context when an automation definition changes', () => {
    const render = mount();
    const before = render();
    world.automations = [{ ...automationRow(1), definition: automation([start()]) }];
    const after = render();
    expect(after.lint).not.toBe(before.lint);
  });
});
