import { describe, expect, it } from 'vitest';
import { decodeMessage } from '../src/decode';
import { encodeMessage } from '../src/encode';
import { IppEncodeError } from '../src/errors';
import { jobTemplateAttributes, mediaSizeOf } from '../src/job-template';
import { OPERATION, STATUS, isSuccess, operationName, statusName } from '../src/ops';
import { plainObject } from '../src/plain';
import {
  cancelSubscription,
  createJob,
  createSubscription,
  getJobs,
  getNotifications,
  getPrinterAttributes,
  identifyPrinter,
  jobOperation,
  printJob,
  printerOperation,
  renewSubscription,
  sendDocument,
  validateJob,
  type Link,
} from '../src/requests';
import { GROUP_TAG } from '../src/tags';

const link: Link = {
  printerUri: 'ipp://printer.local:631/ipp/print',
  user: 'smarteverything',
  requestId: 41,
  version: { major: 2, minor: 0 },
};

function operationOf(bytes: Uint8Array): Readonly<Record<string, unknown>> {
  const message = decodeMessage(bytes);
  return plainObject(message.groups[0]?.attributes ?? []);
}

describe('request building', () => {
  it('starts every request with charset, language, printer uri and user name', () => {
    const message = getPrinterAttributes(link, ['printer-state', 'marker-levels']);
    expect(message).toMatchObject({
      major: 2,
      minor: 0,
      code: OPERATION.getPrinterAttributes,
      requestId: 41,
    });
    const names = message.groups[0]?.attributes.map((entry) => entry.name);
    expect(names?.slice(0, 4)).toEqual([
      'attributes-charset',
      'attributes-natural-language',
      'printer-uri',
      'requesting-user-name',
    ]);
    expect(operationOf(encodeMessage(message))['requested-attributes']).toEqual([
      'printer-state',
      'marker-levels',
    ]);
  });

  it('asks for values valid for one document format', () => {
    const attributes = operationOf(
      encodeMessage(getPrinterAttributes(link, ['all'], 'application/pdf')),
    );
    expect(attributes['document-format']).toBe('application/pdf');
  });

  it('lists jobs of one kind, limited, mine or all', () => {
    const attributes = operationOf(
      encodeMessage(
        getJobs(link, { which: 'not-completed', limit: 20, requested: ['job-id'], mine: true }),
      ),
    );
    expect(attributes).toMatchObject({
      'which-jobs': 'not-completed',
      limit: 20,
      'my-jobs': true,
      'requested-attributes': 'job-id',
    });
  });

  it('targets one job by id', () => {
    for (const operation of [
      OPERATION.cancelJob,
      OPERATION.holdJob,
      OPERATION.releaseJob,
      OPERATION.getJobAttributes,
      OPERATION.closeJob,
    ] as const) {
      const message = jobOperation(link, operation, 9);
      expect(message.code).toBe(operation);
      expect(operationOf(encodeMessage(message))['job-id']).toBe(9);
    }
  });

  it('builds printer-wide operations without extra attributes', () => {
    for (const operation of [
      OPERATION.pausePrinter,
      OPERATION.resumePrinter,
      OPERATION.purgeJobs,
      OPERATION.cancelJobs,
      OPERATION.cancelMyJobs,
    ] as const) {
      expect(printerOperation(link, operation).code).toBe(operation);
    }
  });

  it('identifies with actions and an optional message', () => {
    const plain = operationOf(encodeMessage(identifyPrinter(link, ['flash', 'sound'], 'Here')));
    expect(plain).toMatchObject({ 'identify-actions': ['flash', 'sound'], message: 'Here' });
    expect(
      operationOf(encodeMessage(identifyPrinter(link, ['sound'], null)))['message'],
    ).toBeUndefined();
  });

  it('submits a job as validate, print or create plus send', () => {
    const submission = {
      jobName: 'Report',
      documentFormat: 'application/pdf',
      fidelity: false,
      template: jobTemplateAttributes({ copies: 2, sides: 'two-sided-long-edge' }),
    };
    const validate = validateJob(link, submission);
    expect(validate.code).toBe(OPERATION.validateJob);
    expect(operationOf(encodeMessage(validate))).toMatchObject({
      'job-name': 'Report',
      'document-format': 'application/pdf',
      'ipp-attribute-fidelity': false,
    });
    const print = printJob(link, submission, Uint8Array.of(1, 2, 3));
    expect(decodeMessage(encodeMessage(print)).data).toEqual(Uint8Array.of(1, 2, 3));
    expect(print.groups[1]?.tag).toBe(GROUP_TAG.job);
    const create = createJob(link, submission);
    expect(operationOf(encodeMessage(create))['document-format']).toBeUndefined();
    const send = sendDocument(
      link,
      { jobId: 5, format: 'application/pdf', name: 'a.pdf' },
      Uint8Array.of(9),
    );
    expect(operationOf(encodeMessage(send))).toMatchObject({
      'job-id': 5,
      'document-name': 'a.pdf',
      'last-document': true,
    });
  });

  it('creates, renews, cancels and polls an ippget subscription', () => {
    const created = createSubscription(link, {
      events: ['printer-state-changed'],
      leaseSeconds: 3600,
    });
    expect(plainObject(created.groups[1]?.attributes ?? [])).toMatchObject({
      'notify-pull-method': 'ippget',
      'notify-events': 'printer-state-changed',
      'notify-lease-duration': 3600,
    });
    expect(plainObject(renewSubscription(link, 4, 600).groups[1]?.attributes ?? [])).toEqual({
      'notify-lease-duration': 600,
    });
    expect(operationOf(encodeMessage(cancelSubscription(link, 4)))['notify-subscription-id']).toBe(
      4,
    );
    const first = operationOf(
      encodeMessage(getNotifications(link, { subscriptionId: 4, after: null })),
    );
    expect(first).toMatchObject({ 'notify-subscription-ids': 4, 'notify-wait': true });
    expect(first['notify-sequence-numbers']).toBeUndefined();
    expect(
      operationOf(encodeMessage(getNotifications(link, { subscriptionId: 4, after: 7 })))[
        'notify-sequence-numbers'
      ],
    ).toBe(8);
  });
});

describe('operation and status names', () => {
  it('names known codes and prints unknown ones in hex', () => {
    expect(operationName(0x003c)).toBe('identifyPrinter');
    expect(operationName(0x4001)).toBe('operation 0x4001');
    expect(statusName(STATUS.busy)).toBe('busy');
    expect(statusName(0x0abc)).toBe('status 0x0abc');
    expect(isSuccess(0x0001)).toBe(true);
    expect(isSuccess(0x0400)).toBe(false);
  });
});

describe('job template', () => {
  it('writes only what was asked for', () => {
    expect(jobTemplateAttributes({})).toEqual([]);
  });

  it('writes every option with the right type', () => {
    const plain = plainObject(
      jobTemplateAttributes({
        copies: 3,
        sides: 'one-sided',
        colorMode: 'monochrome',
        quality: 'high',
        orientation: 'landscape',
        numberUp: 2,
        scaling: 'fit',
        priority: 70,
        outputBin: 'face-up',
        resolution: 600,
        contentOptimize: 'photo',
        holdUntil: 'night',
        finishings: [4, 5],
        pageRanges: '1-3, 5',
        media: 'iso_a4_210x297mm',
        mediaSource: 'main',
        mediaType: 'stationery',
      }),
    );
    expect(plain).toMatchObject({
      copies: 3,
      sides: 'one-sided',
      'print-color-mode': 'monochrome',
      'print-quality': 5,
      'orientation-requested': 4,
      'number-up': 2,
      'print-scaling': 'fit',
      'job-priority': 70,
      'output-bin': 'face-up',
      'printer-resolution': { x: 600, y: 600, units: 'dpi' },
      'print-content-optimize': 'photo',
      'job-hold-until': 'night',
      finishings: [4, 5],
      'page-ranges': [
        { lower: 1, upper: 3 },
        { lower: 5, upper: 5 },
      ],
      'media-col': {
        'media-size': { 'x-dimension': 21000, 'y-dimension': 29700 },
        'media-source': 'main',
        'media-type': 'stationery',
      },
    });
  });

  it('leaves out empty finishings and media without source or type', () => {
    const plain = plainObject(
      jobTemplateAttributes({ finishings: [], media: 'na_letter_8.5x11in' }),
    );
    expect(plain['finishings']).toBeUndefined();
    expect(plain['media-col']).toEqual({
      'media-size': { 'x-dimension': 21590, 'y-dimension': 27940 },
    });
  });

  it('reads the size in a media name, in millimetres or inches', () => {
    expect(mediaSizeOf('iso_a5_148x210mm')).toEqual({ width: 14800, height: 21000 });
    expect(mediaSizeOf('na_number-10_4.125x9.5in_by-pass-tray')).toEqual({
      width: 10478,
      height: 24130,
    });
    expect(() => mediaSizeOf('custom')).toThrow(IppEncodeError);
    expect(() => mediaSizeOf('custom_1x2furlong')).toThrow(IppEncodeError);
  });

  it('refuses page ranges that are not numbers', () => {
    expect(() => jobTemplateAttributes({ pageRanges: 'first' })).toThrow(/page ranges/u);
  });
});
