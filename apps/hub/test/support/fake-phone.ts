import {
  bytesToHex,
  decodeResponse,
  gateAllows,
  hexToBytes,
  logRequest,
  nextLogCursor,
  scanLogPage,
  setTimeRequest,
} from '@smarteverything/ble';
import type {
  BottlePlanStep,
  BottleResponse,
  BottleSyncPlan,
  BottleSyncUpload,
} from '@smarteverything/domain';
import type { FakeCap } from './fake-cap';

const PHONE_REQUEST_IDS = 1000;

const MAX_PAGES = 400;

export interface Moment {
  readonly now: Date;
  readonly trigger?: 'wake' | 'action';
  readonly rssi?: number;
}

class Run {
  private readonly responses: BottleResponse[] = [];
  private readonly batteryReads: BottleSyncUpload['batteryReads'] = [];
  private dis: BottleSyncUpload['dis'] = null;
  private outcome: BottleSyncUpload['outcome'] = 'ok';
  private detail: string | null = null;
  private next = PHONE_REQUEST_IDS;
  private readonly at: string;

  constructor(
    private readonly cap: FakeCap,
    private readonly moment: Moment,
  ) {
    this.at = moment.now.toISOString();
  }

  step(step: BottlePlanStep): boolean {
    switch (step.kind) {
      case 'gatt_read':
        this.read(step.what);
        return true;
      case 'set_time':
        this.next += 1;
        this.ask(step.name, setTimeRequest(this.next, this.moment.now.getTime()));
        return true;
      case 'request':
        return this.request(step);
      case 'log':
        this.pages(step);
        return true;
    }
  }

  upload(): BottleSyncUpload {
    return {
      trigger: this.moment.trigger ?? 'wake',
      startedAt: this.at,
      endedAt: this.at,
      outcome: this.outcome,
      detail: this.detail,
      rssi: this.moment.rssi ?? -58,
      dis: this.dis,
      batteryReads: this.batteryReads,
      responses: this.responses,
    };
  }

  private read(what: 'battery' | 'device_information'): void {
    if (what === 'battery') {
      this.batteryReads.push({ at: this.at, pct: this.cap.battery, pushed: false });
    } else {
      this.dis = this.cap.information;
    }
  }

  private ask(name: string, frame: Uint8Array): Uint8Array {
    const answer = this.cap.handle(frame);
    this.responses.push({ name, at: this.at, hex: bytesToHex(answer), timedOut: false });
    return answer;
  }

  private request(step: Extract<BottlePlanStep, { kind: 'request' }>): boolean {
    const answer = this.ask(step.name, hexToBytes(step.requestHex));
    if (step.gate === null || gateAllows(answer, step.gate)) {
      return true;
    }
    this.outcome = 'refused';
    this.detail = 'Put the bottle upright on a flat surface and try again.';
    return false;
  }

  private pages(step: Extract<BottlePlanStep, { kind: 'log' }>): void {
    let from = step.fromTimestamp;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      this.next += 1;
      const answer = this.ask(step.name, logRequest(this.next, step.log, from, step.limit));
      if (decodeResponse(answer).code !== 'success') {
        return;
      }
      const cursor = nextLogCursor(from, step.limit, scanLogPage(answer, step.log));
      if (cursor === null) {
        return;
      }
      from = cursor;
    }
  }
}

export function runPlan(plan: BottleSyncPlan, cap: FakeCap, moment: Moment): BottleSyncUpload {
  const run = new Run(cap, moment);
  for (const step of plan.steps) {
    if (!run.step(step)) {
      break;
    }
  }
  return run.upload();
}
