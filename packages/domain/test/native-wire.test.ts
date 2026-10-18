import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AI_SPEECH_NOTICE,
  AI_SPEECH_PUSH,
  BLE_ADVERT_BATCH,
  BLE_RELAY_RESULT,
  BLE_WATCH,
  HEALTH_BATCH,
  HEALTH_OUTBOX,
  HEALTH_OUTBOX_ACK,
  PHONE_ACTION_ANSWER,
  PHONE_ACTION_PUSH,
  PHONE_APPROVAL_CANCEL_PUSH,
  PHONE_WATCHES,
  WATCH_ACTION_ANSWER,
  WATCH_ACTION_PUSH,
  WATCH_DATA,
  WATCH_RECORDS,
  WATCH_RECORDS_SAVED,
  WATCH_STATE,
} from '../src';

const FIXTURE = z.looseObject({
  responses: z.looseObject({}),
  requests: z.looseObject({}),
});

const fixture = FIXTURE.parse(
  JSON.parse(readFileSync(new URL('./fixtures/native-wire.json', import.meta.url), 'utf8')),
);

const RESPONSES: Readonly<Record<string, z.ZodType>> = {
  healthOutbox: HEALTH_OUTBOX,
  bleWatch: BLE_WATCH,
  bleRelayResult: BLE_RELAY_RESULT,
  phoneWatches: PHONE_WATCHES,
  watchData: WATCH_DATA,
  watchDataEmpty: WATCH_DATA,
  watchRecordsSaved: WATCH_RECORDS_SAVED,
  aiSpeechNotice: AI_SPEECH_NOTICE,
  aiSpeechPush: AI_SPEECH_PUSH,
  phoneActionPush: PHONE_ACTION_PUSH,
  machineApprovalCancelPush: PHONE_APPROVAL_CANCEL_PUSH,
  watchActionPush: WATCH_ACTION_PUSH,
};

const REQUESTS: Readonly<Record<string, z.ZodType>> = {
  ingest: HEALTH_BATCH,
  outboxAck: HEALTH_OUTBOX_ACK,
  bleAdverts: BLE_ADVERT_BATCH,
  watchState: WATCH_STATE,
  watchStateBare: WATCH_STATE,
  watchRecords: WATCH_RECORDS,
  phoneActionAnswer: PHONE_ACTION_ANSWER,
  watchActionAnswer: WATCH_ACTION_ANSWER,
};

describe('native wire fixtures shared with the Kotlin module', () => {
  it('names a schema for every hub answer the native side decodes', () => {
    expect(Object.keys(fixture.responses).sort()).toStrictEqual(Object.keys(RESPONSES).sort());
  });

  it.each(Object.entries(RESPONSES))('the hub answer %s satisfies its schema', (name, schema) => {
    expect(schema.safeParse(fixture.responses[name]).success).toBe(true);
  });

  it('names a schema for every request the native side sends', () => {
    expect(Object.keys(fixture.requests).sort()).toStrictEqual(Object.keys(REQUESTS).sort());
  });

  it.each(Object.entries(REQUESTS))(
    'the native request %s satisfies its schema',
    (name, schema) => {
      expect(schema.safeParse(fixture.requests[name]).success).toBe(true);
    },
  );
});
