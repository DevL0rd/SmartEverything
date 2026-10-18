import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { PHONE_DETAIL, PHONE_DETAIL_NOTICE, type PhoneDetail } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { noticeRouter } from '../../../store/notice-registry';
import { PHONE_DETAIL_NOTICES, phoneDetailKey, receivePhoneDetail } from './phone-detail';

const PHONE = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const EARLIER = '2026-10-18T09:00:00Z';
const LATER = '2026-10-18T09:00:05Z';

function detail(): PhoneDetail {
  return PHONE_DETAIL.parse({
    alarm: { nextAt: '2026-10-19T06:30:00Z', appLabel: 'Clock', at: EARLIER },
    notifications: { count: 2, apps: [], items: null, at: EARLIER },
  });
}

function notice(
  parts: Record<string, Record<string, unknown>>,
  deviceId = PHONE,
): ReturnType<typeof PHONE_DETAIL_NOTICE.parse> {
  const stamped = Object.fromEntries(
    Object.entries(parts).map(([name, section]) => [name, { ...section, at: LATER }]),
  );
  return PHONE_DETAIL_NOTICE.parse({ type: 'phone_detail', deviceId, parts: stamped });
}

function settled(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('receivePhoneDetail', () => {
  it('replaces only the sections the notice carries, each with its own time', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(PHONE), detail());
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    const merged = client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE));
    expect(merged?.alarm).toEqual({ nextAt: null, appLabel: null, at: LATER });
    expect(merged?.notifications).toEqual(detail().notifications);
  });

  it('does not read the sections it already holds again', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(PHONE), {
      ...detail(),
      notifications: { count: 'broken' },
    });
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    expect(client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE))?.notifications).toEqual({
      count: 'broken',
    });
  });

  it('keeps the very same object for a section the notice did not carry', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(PHONE), detail());
    const before = client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE));
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    const after = client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE));
    expect(after?.notifications).toBe(before?.notifications);
    expect(after?.alarm).not.toBe(before?.alarm);
  });

  it('adds a section the stored detail did not have yet', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(PHONE), detail());
    receivePhoneDetail(client, notice({ connections: { bluetooth: [] } }));
    expect(client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE))?.connections).toEqual({
      bluetooth: [],
      at: LATER,
    });
  });

  it('keeps nothing for a phone nobody is looking at', () => {
    const client = new QueryClient();
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    expect(client.getQueryCache().getAll()).toEqual([]);
  });

  it('leaves another phone alone', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(OTHER), detail());
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    expect(client.getQueryData<PhoneDetail>(phoneDetailKey(OTHER))).toEqual(detail());
  });

  it('rereads the detail when a notice arrives before the first read has any data', async () => {
    const client = new QueryClient();
    const reads: ((value: PhoneDetail) => void)[] = [];
    const observer = new QueryObserver<PhoneDetail>(client, {
      queryKey: phoneDetailKey(PHONE),
      queryFn: (): Promise<PhoneDetail> =>
        new Promise<PhoneDetail>((resolve) => {
          reads.push(resolve);
        }),
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await settled();
    expect(reads).toHaveLength(1);
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    await settled();
    expect(reads).toHaveLength(2);
    unsubscribe();
  });

  it('rereads instead of applying a notice while a newer read is already in flight', async () => {
    const client = new QueryClient();
    const reads: ((value: PhoneDetail) => void)[] = [];
    client.setQueryData(phoneDetailKey(PHONE), detail());
    const observer = new QueryObserver<PhoneDetail>(client, {
      queryKey: phoneDetailKey(PHONE),
      staleTime: 0,
      queryFn: (): Promise<PhoneDetail> =>
        new Promise<PhoneDetail>((resolve) => {
          reads.push(resolve);
        }),
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await settled();
    expect(reads).toHaveLength(1);
    receivePhoneDetail(client, notice({ alarm: { nextAt: null, appLabel: null } }));
    await settled();
    expect(client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE))?.alarm?.at).toBe(EARLIER);
    expect(reads).toHaveLength(2);
    unsubscribe();
  });
});

describe('PHONE_DETAIL_NOTICES', () => {
  it('is the one handler of the phone_detail notice and applies it to the query cache', () => {
    const client = new QueryClient();
    client.setQueryData(phoneDetailKey(PHONE), detail());
    const route = noticeRouter([PHONE_DETAIL_NOTICES], { client, store: new EntityStore() });
    expect(route(notice({ alarm: { nextAt: null, appLabel: null } }), true)).toBe(true);
    expect(client.getQueryData<PhoneDetail>(phoneDetailKey(PHONE))?.alarm?.at).toBe(LATER);
  });
});
