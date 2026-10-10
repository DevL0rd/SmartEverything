import {
  ROBOT_ACTIVITY_ENTRY,
  type RobotActivityEntry,
  type JsonValue,
} from '@smarteverything/domain';
import type { PluginRecords } from '../contract';

const ACTIVITY_CAPACITY = 500;
const TITLE_MAX = 200;
const DETAIL_MAX = 2000;

const KEY_DIGITS = 9;

export type ActivityKind = RobotActivityEntry['kind'];

export interface ActivityOptions {
  readonly records: PluginRecords;
  readonly now: () => Date;
  readonly changed: (entry: RobotActivityEntry) => void;
  readonly unreadable: (key: string, reason: string) => void;
}

function keyOf(id: number): string {
  return String(id).padStart(KEY_DIGITS, '0');
}

export class ActivityLog {
  private entries: RobotActivityEntry[] = [];
  private next = 1;

  constructor(private readonly options: ActivityOptions) {}

  load(): void {
    const readable: RobotActivityEntry[] = [];
    for (const { key, value } of this.options.records.list()) {
      const parsed = ROBOT_ACTIVITY_ENTRY.safeParse(value);
      if (parsed.success) {
        readable.push(parsed.data);
      } else {
        this.options.unreadable(key, parsed.error.message);
      }
    }
    this.entries = readable.sort((a, b) => a.id - b.id).slice(-ACTIVITY_CAPACITY);
    this.next = (this.entries.at(-1)?.id ?? 0) + 1;
  }

  add(kind: ActivityKind, title: string, detail = ''): RobotActivityEntry {
    const entry: RobotActivityEntry = {
      id: this.next,
      at: this.options.now().toISOString(),
      kind,
      title: title.slice(0, TITLE_MAX),
      detail: detail.slice(0, DETAIL_MAX),
    };
    this.next += 1;
    this.entries.push(entry);
    const value: JsonValue = { ...entry };
    this.options.records.put(keyOf(entry.id), value);
    for (const dropped of this.entries.splice(
      0,
      Math.max(0, this.entries.length - ACTIVITY_CAPACITY),
    )) {
      this.options.records.remove(keyOf(dropped.id));
    }
    this.options.changed(entry);
    return entry;
  }

  recent(limit: number, kind: ActivityKind | null = null): RobotActivityEntry[] {
    const matching =
      kind === null ? this.entries : this.entries.filter((entry) => entry.kind === kind);
    return matching.slice(-limit);
  }
}
