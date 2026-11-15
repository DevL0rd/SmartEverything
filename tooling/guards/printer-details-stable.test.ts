import { describe, expect, it } from 'vitest';
import type { PrinterStatus } from '@smarteverything/ipp';
import { decodeMessage } from '../../packages/ipp/src/decode';
import { readDescription } from '../../packages/ipp/src/description';
import { plainGroups } from '../../packages/ipp/src/plain';
import { readStatus } from '../../packages/ipp/src/status';
import { GROUP_TAG } from '../../packages/ipp/src/tags';
import { GET_PRINTER_ATTRIBUTES_RESPONSE } from '../../packages/ipp/test/fixtures/gpa-response';
import { bytesOf } from '../../packages/ipp/test/helpers';
import { featuresOf } from '../../apps/hub/src/plugins/builtin/printer/device';
import { detailsOf } from '../../apps/hub/src/plugins/builtin/printer/device-details';
import {
  bootedAtOf,
  buildModel,
  type PrinterModel,
} from '../../apps/hub/src/plugins/builtin/printer/model';
import { PRINTER_RECORD } from '../../apps/hub/src/plugins/builtin/printer/records';

const POLL_MS = 30_250;
const START = new Date('2026-10-18T10:00:00.400Z');

const printer =
  plainGroups(
    decodeMessage(bytesOf(GET_PRINTER_ATTRIBUTES_RESPONSE)).groups,
    GROUP_TAG.printer,
  )[0] ?? {};
const description = readDescription(printer);
const baseStatus = readStatus(printer);

function modelAt(
  now: Date,
  upTime: number,
  online: boolean,
  previous: PrinterModel | null,
): PrinterModel {
  const status: PrinterStatus = { ...baseStatus, upTime };
  const record = PRINTER_RECORD.parse({
    uuid: '5ea8558e-a16f-3ee9-703c-df37e677edab',
    uri: 'ipp://printer.test:631/ipp/print',
    name: 'Printer',
    firstDay: '2026-10-01',
    lastSeen: online ? now.toISOString() : START.toISOString(),
    lastUpTime: upTime,
  });
  return buildModel({
    record,
    description,
    status,
    online,
    pagesToday: 0,
    pagesWeek: 0,
    jobProgress: null,
    activeJob: null,
    forecasts: new Map(),
    costMonth: null,
    gapOpen: !online,
    observedAt: now.toISOString(),
    bootedAt: bootedAtOf(previous, status, now),
  });
}

function detailsAt(model: PrinterModel): unknown {
  return detailsOf(model, featuresOf(model));
}

describe('printer device details', () => {
  it('stay deep-equal across polls of an unchanged online printer, so the device row is not rewritten each poll', () => {
    const first = modelAt(START, 1200, true, null);
    let previous = first;
    for (let poll = 1; poll <= 20; poll += 1) {
      const now = new Date(START.getTime() + poll * POLL_MS);
      const next = modelAt(now, 1200 + Math.floor((poll * POLL_MS) / 1000), true, previous);
      expect(detailsAt(next)).toStrictEqual(detailsAt(first));
      previous = next;
    }
  });

  it('stay deep-equal across polls while the printer is offline', () => {
    const first = modelAt(START, 1200, false, null);
    const later = modelAt(new Date(START.getTime() + POLL_MS), 1200, false, first);
    expect(detailsAt(later)).toStrictEqual(detailsAt(first));
  });

  it('publish no last-seen time while online and a new boot time after a restart', () => {
    const first = modelAt(START, 1200, true, null);
    const restarted = modelAt(new Date(START.getTime() + POLL_MS), 5, true, first);
    expect(detailsOf(first, featuresOf(first)).lastSeen).toBeNull();
    expect(detailsOf(first, featuresOf(first)).bootedAt).toBe('2026-10-18T09:40:00.000Z');
    expect(detailsOf(restarted, featuresOf(restarted)).bootedAt).toBe('2026-10-18T10:00:26.000Z');
  });
});
