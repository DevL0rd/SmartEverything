import { stampPhoneDetail } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detailKeyframe,
  detailNotice,
  phoneViewerOfClient,
  readPhoneDetail,
  tierOfViewer,
  type PhoneViewer,
} from '../../src/phones/phone-detail';
import type { PhoneTarget } from '../../src/phones/phone-nodes';
import { captureLogs } from '../support/logs';
import {
  addPerson,
  addPhoneDevice,
  REPORT_AT,
  STORED_DETAIL,
  type TestPerson,
} from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let target: PhoneTarget;

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  const phone = addPhoneDevice(test, {
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  });
  target = {
    deviceId: phone.device.id,
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  };
  test.store.phoneDetails.merge(target.deviceId, STORED_DETAIL);
});

afterEach(async () => {
  await test.close();
});

function viewer(person: TestPerson): PhoneViewer {
  return phoneViewerOfClient(test.store, person.client);
}

describe('who sees which tier of a phone', () => {
  it('gives the phone’s own person the person tier, the owner the owner tier, others the member tier', () => {
    expect(tierOfViewer(target, viewer(dana))).toBe('person');
    expect(tierOfViewer(target, viewer(owner))).toBe('owner');
    expect(tierOfViewer(target, viewer(sam))).toBe('member');
  });
});

describe('reading phone detail', () => {
  it('gives the person everything, including apps, titles and the Wi-Fi name', () => {
    const detail = readPhoneDetail(test.store, target, viewer(dana), undefined);
    expect(detail.network?.wifi?.ssid).toBe('Home');
    expect(detail.notifications?.items?.[0]?.title).toBe('Hello');
    expect(detail.apps?.installed).toHaveLength(2);
    expect(detail.sound?.media?.title).toBe('Song');
  });

  it('gives the owner the totals of another person’s phone', () => {
    const detail = readPhoneDetail(test.store, target, viewer(owner), undefined);
    expect(detail.apps).toMatchObject({ installedCount: 2 });
    expect(detail.notifications).toMatchObject({ count: 4 });
    expect(detail.network?.data?.today.wifiBytes).toBe(1e9);
    expect(detail.screen?.usage?.unlocksToday).toBe(41);
  });

  it('keeps from the owner what belongs to the phone’s own person alone', () => {
    const detail = readPhoneDetail(test.store, target, viewer(owner), undefined);
    expect(detail.apps).toMatchObject({ installed: [], usage: [], front: null });
    expect(detail.notifications).toMatchObject({ apps: [], items: null });
    expect(detail.network?.wifi?.ssid).toBeNull();
    expect(detail.sound?.media?.title).toBeNull();
    expect(detail.connections?.bluetooth[0]?.name).toBeNull();
  });

  it('gives another member only power, alarm, sound levels, screen settings and signal', () => {
    const detail = readPhoneDetail(test.store, target, viewer(sam), undefined);
    expect(Object.keys(detail).sort()).toEqual(['alarm', 'network', 'power', 'screen', 'sound']);
    expect(detail.screen?.usage).toBeNull();
    expect(detail.network?.data).toBeNull();
    expect(detail.network?.wifi?.ssid).toBeNull();
  });

  it('returns only the sections asked for, still cut to the viewer', () => {
    const detail = readPhoneDetail(test.store, target, viewer(owner), ['power', 'apps']);
    expect(Object.keys(detail).sort()).toEqual(['apps', 'power']);
    expect(detail.apps?.installed).toEqual([]);
  });

  it('returns nothing for a phone that has not reported', () => {
    const other = addPhoneDevice(test, {
      clientId: sam.client.id,
      profileId: sam.profileId,
      name: 'Sam phone',
    });
    const quiet = { ...target, deviceId: other.device.id };
    expect(readPhoneDetail(test.store, quiet, viewer(dana), undefined)).toEqual({});
  });
});

describe('live detail notices', () => {
  it('opens a watch with the stored detail, every section dated by its own report', () => {
    test.store.phoneDetails.merge(
      target.deviceId,
      stampPhoneDetail({ alarm: { nextAt: null, appLabel: null } }, '2026-10-18T10:07:00.000Z'),
    );
    const notice = detailKeyframe(test.store, target, viewer(dana));
    expect(notice).toMatchObject({ type: 'phone_detail', deviceId: target.deviceId });
    expect(notice?.parts.power).toMatchObject({ level: 62, at: REPORT_AT });
    expect(notice?.parts.alarm).toEqual({
      nextAt: null,
      appLabel: null,
      at: '2026-10-18T10:07:00.000Z',
    });
  });

  it('has no opening notice for a phone without detail', () => {
    const quiet = addPhoneDevice(test, {
      clientId: sam.client.id,
      profileId: sam.profileId,
      name: 'Sam phone',
    });
    expect(
      detailKeyframe(test.store, { ...target, deviceId: quiet.device.id }, viewer(dana)),
    ).toBeNull();
  });

  it('cuts the opening notice for another member the same way as a read', () => {
    const notice = detailKeyframe(test.store, target, viewer(sam));
    expect(Object.keys(notice?.parts ?? {}).sort()).toEqual([
      'alarm',
      'network',
      'power',
      'screen',
      'sound',
    ]);
  });

  it('cuts a change to what the watcher may see and sends nothing when nothing is left', () => {
    const change = stampPhoneDetail(
      {
        notifications: {
          count: 4,
          apps: [{ package: 'com.a', label: 'A', count: 4 }],
          items: [{ key: 'k1', package: 'com.a', title: 'Hello', at: REPORT_AT }],
        },
      },
      REPORT_AT,
    );
    expect(detailNotice(target, change, viewer(dana))?.parts.notifications?.items).toHaveLength(1);
    expect(detailNotice(target, change, viewer(owner))?.parts.notifications).toMatchObject({
      count: 4,
      apps: [],
      items: null,
    });
    expect(detailNotice(target, change, viewer(sam))).toBeNull();
  });
});
