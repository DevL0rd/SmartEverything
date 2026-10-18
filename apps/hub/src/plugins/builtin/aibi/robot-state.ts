import {
  ROBOT_ONLINE_WINDOW_MS,
  ROBOT_REPORT,
  type RobotReport,
  type RobotStatus,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginRecords } from '../contract';
import { jsonOf } from '../json-value';
import { ROBOT_IDENTITY, type RobotIdentity } from './identity';
import type { DeskStatus } from './desk';
import { AIBI_PORTS, type AibiSettings } from './settings';

const CONTACT_SAVE_GAP_MS = 60_000;
const CALLS_SHOWN = 12;
const PATH_MAX = 200;
const IDENTITY_KEY = 'identity';
const REPORT_KEY = 'report';
const CONTACT_KEY = 'contact';
const IPV4_MAPPED = /^::ffff:/;

const CONTACT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  remote: z.string().max(60),
  path: z.string().max(200),
});

type Contact = z.output<typeof CONTACT>;

export type Listener = RobotStatus['server'];

export interface StatusInputs {
  readonly settings: AibiSettings;
  readonly desk: DeskStatus;
  readonly configured: boolean;
  readonly lines: RobotStatus['lines'];
  readonly now: Date;
}

export class RobotState {
  identity: RobotIdentity | null = null;
  report: RobotReport | null = null;
  contact: Contact | null = null;
  address: string | null = null;
  server: Listener = { state: 'off', reason: null };
  dns: Listener = { state: 'off', reason: null };
  private readonly calls = new Map<string, { count: number; last: string }>();
  private contactSavedAt = 0;

  constructor(
    private readonly records: PluginRecords,
    private readonly now: () => Date,
  ) {}

  load(): void {
    const identity = ROBOT_IDENTITY.safeParse(this.records.get(IDENTITY_KEY));
    this.identity = identity.success ? identity.data : null;
    const report = ROBOT_REPORT.safeParse(this.records.get(REPORT_KEY));
    this.report = report.success ? report.data : null;
    const contact = CONTACT.safeParse(this.records.get(CONTACT_KEY));
    this.contact = contact.success ? contact.data : null;
  }

  online(): boolean {
    return (
      this.contact !== null &&
      this.now().getTime() - Date.parse(this.contact.at) < ROBOT_ONLINE_WINDOW_MS
    );
  }

  contacted(remote: string, requested: string): boolean {
    const path = requested.slice(0, PATH_MAX);
    const first = this.contact === null;
    const at = this.now().toISOString();
    const seen = this.calls.get(path);
    this.calls.set(path, { count: (seen?.count ?? 0) + 1, last: at });
    this.contact = { at, remote: remote.replace(IPV4_MAPPED, ''), path };
    if (this.now().getTime() - this.contactSavedAt >= CONTACT_SAVE_GAP_MS) {
      this.contactSavedAt = this.now().getTime();
      this.records.put(CONTACT_KEY, jsonOf(this.contact));
    }
    return first;
  }

  identified(identity: RobotIdentity): boolean {
    if (JSON.stringify(identity) === JSON.stringify(this.identity)) {
      return false;
    }
    this.identity = identity;
    this.records.put(IDENTITY_KEY, jsonOf(identity));
    return true;
  }

  reported(report: RobotReport): void {
    this.report = report;
    this.records.put(REPORT_KEY, jsonOf(report));
  }

  status(inputs: StatusInputs): RobotStatus {
    const { settings } = inputs;
    return {
      mode: settings.mode,
      address: this.address,
      server: this.server,
      dns: settings.dns ? this.dns : { state: 'off', reason: null },
      ports: AIBI_PORTS,
      contact: this.contact,
      calls: [...this.calls.entries()]
        .map(([path, seen]) => ({ path, ...seen }))
        .sort((a, b) => b.last.localeCompare(a.last))
        .slice(0, CALLS_SHOWN),
      robot: this.report,
      conversation: inputs.desk.conversation,
      waiting: inputs.desk.waiting,
      tasks: inputs.desk.tasks,
      configured: inputs.configured,
      capture: settings.capture,
      lines: inputs.lines,
      updatedAt: inputs.now.toISOString(),
    };
  }
}
