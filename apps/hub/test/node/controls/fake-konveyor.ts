import type {
  BusCall,
  SignalListener,
  SignalRule,
} from '../../../src/node/controls/linux/dbus-session';
import type { KonveyorBus } from '../../../src/node/controls/linux/konveyor';

export const WINDOWS_SAMPLE = [
  {
    id: 7,
    title: 'main.ts - Editor',
    app_id: 'org.kde.kate',
    pid: 4242,
    uuid: '{0f4d8e66-6c2b-4b64-9d75-3a1f2b8d9c10}',
    workspace_id: 1,
    is_focused: true,
    is_floating: false,
    is_urgent: false,
    layout: {
      pos_in_scrolling_layout: [1, 1],
      tile_size: [1280, 1380],
      window_size: [1280, 1380],
      tile_pos_in_workspace_view: [0, 30],
      window_offset_in_tile: [0, 0],
    },
  },
  {
    id: 9,
    title: 'Terminal',
    app_id: 'org.example.terminal',
    pid: 4343,
    uuid: '{5a0b6c9e-92a1-4c3a-8b88-0d4c3b2a1f99}',
    workspace_id: 1,
    is_focused: false,
    is_floating: true,
    is_urgent: true,
    layout: {
      pos_in_scrolling_layout: null,
      tile_size: [800, 600],
      window_size: [800, 600],
      tile_pos_in_workspace_view: [100, 100],
      window_offset_in_tile: [0, 0],
    },
  },
];

export const WORKSPACES_SAMPLE = [
  {
    id: 1,
    idx: 1,
    name: 'code',
    output: 'DP-1',
    is_urgent: false,
    is_active: true,
    is_focused: true,
    active_window_id: 7,
    columns: [[7]],
    column_displays: ['normal'],
    group_app_windows: 'off',
  },
  {
    id: 2,
    idx: 2,
    name: null,
    output: 'DP-1',
    is_urgent: true,
    is_active: false,
    is_focused: false,
    active_window_id: null,
    columns: [],
    column_displays: [],
    group_app_windows: 'off',
  },
];

export const OUTPUTS_SAMPLE = [
  {
    name: 'DP-1',
    description: 'Dell U2723QE',
    logical: { x: 0, y: 0, width: 2560, height: 1440, scale: 1 },
  },
];

export class FakeKonveyorBus implements KonveyorBus {
  owned = true;
  refusal = '';
  closed = false;
  reads = 0;
  readonly calls: BusCall[] = [];
  readonly rules: SignalRule[] = [];
  private readonly listeners = new Map<string, SignalListener>();
  private hold: Promise<void> | null = null;
  windows: unknown = WINDOWS_SAMPLE;
  workspaces: unknown = WORKSPACES_SAMPLE;
  overviewOpen = false;

  call = async (request: BusCall): Promise<readonly unknown[]> => {
    this.calls.push(request);
    switch (request.member) {
      case 'NameHasOwner':
        return [this.owned];
      case 'Windows':
        this.reads += 1;
        await this.hold;
        return [JSON.stringify(this.windows)];
      case 'Workspaces':
        return [JSON.stringify(this.workspaces)];
      case 'Outputs':
        return [JSON.stringify(OUTPUTS_SAMPLE)];
      case 'OverviewState':
        return [JSON.stringify({ is_open: this.overviewOpen })];
      case 'Action':
        return [this.refusal];
      default:
        throw new Error(`unscripted Konveyor call ${request.member}`);
    }
  };

  watch = (rule: SignalRule, listener: SignalListener): Promise<() => void> => {
    this.rules.push(rule);
    this.listeners.set(rule.member, listener);
    return Promise.resolve(() => {
      this.listeners.delete(rule.member);
    });
  };

  close = (): void => {
    this.closed = true;
  };

  members(): readonly string[] {
    return this.calls.map((call) => call.member);
  }

  watching(member: string): boolean {
    return this.listeners.has(member);
  }

  emit(member: string, body: readonly unknown[] = [], sender = ':1.42'): void {
    this.listeners.get(member)?.(body, sender);
  }

  holdReads(): () => void {
    let release = (): void => undefined;
    this.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    return (): void => {
      this.hold = null;
      release();
    };
  }
}
