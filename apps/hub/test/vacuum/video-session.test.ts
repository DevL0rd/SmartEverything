import { createSocket } from 'node:dgram';
import {
  ApiError,
  type JsonValue,
  type ProcessWindow,
  type VacuumVideoOpening,
} from '@smarteverything/domain';
import {
  parseToken,
  pv11glCatalog,
  type ActionAddress,
  type PropertyWrite,
} from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lanIo } from '../../src/adapters/xiaomi/device-io';
import { MessageIds, MiioClient } from '../../src/adapters/xiaomi/miio-client';
import { Go2rtcError } from '../../src/cameras/go2rtc-client';
import { Viewers, deviceTarget } from '../../src/metrics/viewers';
import type { VacuumCommandIo } from '../../src/vacuum/command-service';
import {
  UNLOCK_WINDOW_MS,
  VacuumVideo,
  vacuumVideoStream,
  type VacuumVideoClient,
} from '../../src/vacuum/video-session';
import { FakeVacuum } from '../support/fake-vacuum';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { dependencies, routedFetch } from '../xiaomi/harness';

const NOW = '2026-10-24T10:00:00.000Z';
const PASSWORD = '4821';
const SOURCE = 'xiaomi://1:de@10.0.0.9?did=5550003&model=xiaomi.vacuum.pv11gl&transport=udp';
const OFFER = 'v=0\r\nm=video 9 UDP/TLS/RTP 96\r\na=recvonly\r\n';
const HOST = '127.0.0.8';
const TOKEN = '0123456789abcdef0123456789abcdef';

interface Gate {
  switchOn: boolean;
  rejectPage: string | null;
  lock: boolean;
  password: boolean;
  verdict: string;
}

type Step =
  | { readonly kind: 'action'; readonly address: string; readonly inputs: readonly JsonValue[] }
  | { readonly kind: 'write'; readonly writes: readonly PropertyWrite[] };

let opened: TestStore;
let logs: CapturedLogs;
let gate: Gate;
let viewers: Viewers<ProcessWindow>;
let putStream: () => Promise<void>;
let steps: Step[];
let go2rtc: string[];
let answer: () => Promise<string>;
let blocking: string | null;
let deviceId: string;

function addRobot(details: Readonly<Record<string, JsonValue>>): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: '5550003',
      parentId: null,
      kind: 'vacuum',
      name: 'Robot',
      model: pv11glCatalog().model,
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details,
    },
  ]);
  if (row === undefined) throw new Error('The robot was not stored.');
  return row.id;
}

function scriptedIo(): VacuumCommandIo {
  return {
    write: (writes): Promise<void> => {
      steps.push({ kind: 'write', writes });
      return Promise.resolve();
    },
    action: (address: ActionAddress, inputs): Promise<JsonValue> => {
      const where = `${String(address.siid)}.${String(address.aiid)}`;
      steps.push({ kind: 'action', address: where, inputs });
      if (where === '21.4' && JSON.stringify(inputs).includes(`"${gate.rejectPage ?? '-'}"`)) {
        return Promise.reject(new Error('the robot did not answer'));
      }
      if (where === '21.5') {
        const status = {
          video_switch_status: gate.switchOn,
          physical_control_lock: gate.lock,
          video_passwd_exist: gate.password,
        };
        return Promise.resolve([{ piid: 7, value: JSON.stringify(status) }]);
      }
      return Promise.resolve(where === '21.7' ? [{ piid: 7, value: gate.verdict }] : []);
    },
  };
}

function client(): VacuumVideoClient {
  return {
    putStream: (name, sources): Promise<void> => {
      go2rtc.push(`put ${name} ${sources.join(' ')}`);
      return putStream();
    },
    deleteStream: (name): Promise<void> => {
      go2rtc.push(`delete ${name}`);
      return Promise.resolve();
    },
    answer: (name): Promise<string> => {
      go2rtc.push(`answer ${name}`);
      return answer();
    },
  };
}

function video(io: () => VacuumCommandIo | null = scriptedIo): VacuumVideo {
  const subject = new VacuumVideo({
    client: client(),
    blockingAddress: (): string | null => blocking,
    devices: opened.store.devices,
    viewers,
    io,
    now: (): Date => new Date(NOW),
    log: testLogger('vacuum'),
  });
  subject.follow(deviceId);
  return subject;
}

function open(subject: VacuumVideo): Promise<VacuumVideoOpening> {
  return subject.open(deviceId, { password: PASSWORD, sdp: OFFER });
}

function hold(holder: string): void {
  viewers.hold(holder, [{ target: deviceTarget(deviceId), topic: 'video' }]);
}

const flushed = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const on = (value: boolean): Step => ({
  kind: 'write',
  writes: [{ siid: 21, piid: 6, value }],
});

const page = (value: string): Step => ({
  kind: 'action',
  address: '21.4',
  inputs: [{ piid: 7, value }],
});

const STATUS_READ: Step = { kind: 'action', address: '21.5', inputs: [] };
const VERIFY: Step = { kind: 'action', address: '21.7', inputs: [{ piid: 7, value: PASSWORD }] };

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  gate = { switchOn: false, rejectPage: null, lock: true, password: true, verdict: '0' };
  viewers = new Viewers<ProcessWindow>();
  putStream = (): Promise<void> => Promise.resolve();
  steps = [];
  go2rtc = [];
  answer = (): Promise<string> => Promise.resolve('answer-sdp');
  blocking = null;
  deviceId = addRobot({ vacuumVideoSource: SOURCE });
  hold('camera:1');
});

afterEach(async () => {
  await opened.close();
});

describe('the vacuum live camera, opened only on demand', () => {
  it('does nothing on the robot or in go2rtc until a viewer opens it', () => {
    video();
    expect(steps).toStrictEqual([]);
    expect(go2rtc).toStrictEqual([]);
  });

  it('switches video on, checks the password, enters the video page and answers the offer', async () => {
    expect(await open(video())).toStrictEqual({ status: 'live', sdp: 'answer-sdp' });
    expect(steps).toStrictEqual([STATUS_READ, on(true), VERIFY, page('3')]);
    const stream = vacuumVideoStream(deviceId);
    expect(go2rtc).toStrictEqual([`put ${stream} ${SOURCE}`, `answer ${stream}`]);
  });

  it('leaves the video page, restores the video switch and removes the stream when the last holder lets go', async () => {
    const subject = video();
    await open(subject);
    steps = [];
    viewers.release('camera:1');
    await flushed();
    expect(steps).toStrictEqual([page('4'), on(false)]);
    expect(go2rtc.at(-1)).toBe(`delete ${vacuumVideoStream(deviceId)}`);
    steps = [];
    await subject.close(deviceId);
    expect(steps).toStrictEqual([]);
  });

  it('keeps the video switch on at close when it was on before the open', async () => {
    gate.switchOn = true;
    const subject = video();
    await open(subject);
    expect(steps).toStrictEqual([STATUS_READ, VERIFY, page('3')]);
    steps = [];
    viewers.release('camera:1');
    await flushed();
    expect(steps).toStrictEqual([page('4')]);
  });

  it('keeps the stream while another viewer holds the video demand and ignores a delete then', async () => {
    const subject = video();
    await open(subject);
    hold('camera:2');
    steps = [];
    await subject.close(deviceId);
    viewers.release('camera:1');
    await flushed();
    expect(steps).toStrictEqual([]);
    viewers.release('camera:2');
    await flushed();
    expect(steps).toStrictEqual([page('4'), on(false)]);
  });

  it('refuses to open for a caller that does not hold the video demand', async () => {
    viewers.release('camera:1');
    await expect(open(video())).rejects.toThrow('camera view');
    expect(steps).toStrictEqual([]);
  });

  it('closes every session on closeAll even while viewers still hold the demand', async () => {
    const subject = video();
    await open(subject);
    steps = [];
    await subject.closeAll();
    expect(steps).toStrictEqual([page('4'), on(false)]);
  });

  it('asks a second viewer for the password but does not enter the video page or switch twice', async () => {
    const subject = video();
    await open(subject);
    steps = [];
    expect(await open(subject)).toMatchObject({ status: 'live' });
    expect(steps).toStrictEqual([STATUS_READ, VERIFY]);
  });

  it('leaves the first viewer live when a second open fails', async () => {
    const subject = video();
    await open(subject);
    steps = [];
    gate.verdict = '-1';
    expect(await open(subject)).toStrictEqual({ status: 'wrong_password' });
    expect(steps).toStrictEqual([STATUS_READ, VERIFY]);
  });

  it('still sends 4, deletes the stream and restores the switch when putStream fails', async () => {
    putStream = (): Promise<void> => Promise.reject(new Error('go2rtc is down'));
    await expect(open(video())).rejects.toThrow('go2rtc is down');
    expect(steps.slice(-3)).toStrictEqual([page('3'), page('4'), on(false)]);
    expect(go2rtc.at(-1)).toBe(`delete ${vacuumVideoStream(deviceId)}`);
  });

  it('still sends 4 and restores the switch when the call that enters the video page fails', async () => {
    gate.rejectPage = '3';
    await expect(open(video())).rejects.toThrow('did not answer');
    expect(steps.slice(-3)).toStrictEqual([page('3'), page('4'), on(false)]);
  });

  it('restores the switch when the password check fails and sends no 4', async () => {
    gate.verdict = 'x';
    await expect(open(video())).rejects.toThrow();
    expect(steps.slice(-2)).toStrictEqual([VERIFY, on(false)]);
    expect(go2rtc).toStrictEqual([]);
  });

  it('reports the original failure when the cleanup fails too', async () => {
    putStream = (): Promise<void> => Promise.reject(new Error('go2rtc is down'));
    gate.rejectPage = '4';
    await expect(open(video())).rejects.toThrow('go2rtc is down');
    expect(logs.events()).toContain('vacuum_video.close_failed');
  });

  it('starts the unlock window and asks for the button on the robot while the lock is held', async () => {
    gate.lock = false;
    const subject = video();
    const until = new Date(Date.parse(NOW) + UNLOCK_WINDOW_MS).toISOString();
    expect(await open(subject)).toStrictEqual({ status: 'press_button', until });
    expect(steps).toStrictEqual([STATUS_READ, page('1')]);
    steps = [];
    viewers.release('camera:1');
    await flushed();
    expect(steps).toStrictEqual([page('0')]);
    expect(go2rtc).toStrictEqual([]);
  });

  it('goes live without any password step when the robot has none', async () => {
    gate.password = false;
    expect(await open(video())).toStrictEqual({ status: 'live', sdp: 'answer-sdp' });
    expect(steps).toStrictEqual([STATUS_READ, on(true), page('3')]);
  });

  it('ignores a password that is sent to a robot without one', async () => {
    gate.password = false;
    const subject = video();
    expect(await subject.open(deviceId, { password: PASSWORD, sdp: OFFER })).toStrictEqual({
      status: 'live',
      sdp: 'answer-sdp',
    });
    expect(steps).toStrictEqual([STATUS_READ, on(true), page('3')]);
  });

  it('asks for the password and touches nothing else when the robot has one and none was sent', async () => {
    expect(await video().open(deviceId, { sdp: OFFER })).toStrictEqual({
      status: 'password_required',
    });
    expect(steps).toStrictEqual([STATUS_READ]);
    expect(go2rtc).toStrictEqual([]);
  });

  it('restores the switch and answers no_reply when a robot without a password never streams', async () => {
    gate.password = false;
    answer = (): Promise<string> =>
      Promise.reject(new Go2rtcError('webrtc.offer', 500, 'streams: read udp: i/o timeout'));
    expect(await open(video())).toStrictEqual({ status: 'no_reply' });
    expect(steps).toStrictEqual([STATUS_READ, on(true), page('3'), page('4'), on(false)]);
  });

  it('switches video off again after a wrong password and streams nothing', async () => {
    gate.verdict = '-1';
    expect(await open(video())).toStrictEqual({ status: 'wrong_password' });
    expect(steps).toStrictEqual([STATUS_READ, on(true), VERIFY, on(false)]);
    expect(go2rtc).toStrictEqual([]);
  });

  it('answers no_reply and closes everything when the robot never answers the handshake', async () => {
    answer = (): Promise<string> =>
      Promise.reject(new Go2rtcError('webrtc.offer', 500, 'streams: read udp: i/o timeout'));
    expect(await open(video())).toStrictEqual({ status: 'no_reply' });
    expect(steps.slice(-2)).toStrictEqual([page('4'), on(false)]);
    expect(go2rtc.at(-1)).toBe(`delete ${vacuumVideoStream(deviceId)}`);
  });

  it('names the firewall when it blocks the robot video', async () => {
    blocking = '10.0.0.9';
    answer = (): Promise<string> =>
      Promise.reject(new Go2rtcError('webrtc.offer', 500, 'streams: read udp: i/o timeout'));
    expect(await open(video())).toStrictEqual({ status: 'firewall_blocked', address: '10.0.0.9' });
  });

  it('switches video off when go2rtc fails for another reason and reports that failure', async () => {
    answer = (): Promise<string> =>
      Promise.reject(new Go2rtcError('webrtc.offer', 500, 'codec not matched'));
    await expect(open(video())).rejects.toThrow('codec not matched');
    expect(steps.slice(-2)).toStrictEqual([page('4'), on(false)]);
  });

  it('refuses a robot that is not reachable and one without a LAN address', async () => {
    await expect(open(video(() => null))).rejects.toThrow(ApiError);
    deviceId = addRobot({});
    hold('camera:3');
    await expect(open(video())).rejects.toThrow('has no LAN address');
    expect(steps).toStrictEqual([]);
  });

  it('never writes the password into a log record', async () => {
    gate.verdict = '-1';
    await open(video());
    gate.verdict = '0';
    await open(video());
    expect(JSON.stringify(logs.records)).not.toContain(PASSWORD);
    expect(logs.events()).toContain('vacuum_video.opened');
  });
});

describe('the vacuum live camera on the fake pv11gl', () => {
  let robot: FakeVacuum;
  let miio: MiioClient;

  beforeEach(async () => {
    robot = new FakeVacuum({
      host: HOST,
      deviceId: 0x0a0b0c0f,
      token: TOKEN,
      did: '5550003',
      uid: '4440004',
    });
    const port = await robot.start();
    miio = new MiioClient({
      host: HOST,
      port,
      token: parseToken(TOKEN),
      socket: createSocket('udp4'),
      timing: dependencies(routedFetch([]), port).timing,
      now: (): number => Date.now(),
      log: testLogger('xiaomi'),
      messageIds: new MessageIds(0),
    });
  });

  afterEach(async () => {
    await miio.close();
    await robot.stop();
  });

  it('reads the recorded gate, starts the unlock window and touches nothing else', async () => {
    const subject = video(() => lanIo('5550003', miio));
    expect(await open(subject)).toMatchObject({ status: 'press_button' });
    expect(robot.actions.map(({ siid, aiid }) => `${String(siid)}.${String(aiid)}`)).toStrictEqual([
      '21.5',
      '21.4',
    ]);
    expect(robot.actions[1]?.inputs).toStrictEqual([{ piid: 7, value: '1' }]);
    expect(robot.writes).toStrictEqual([]);
  });

  it('goes live without a password step on a robot that holds none', async () => {
    const status = {
      video_switch_status: true,
      physical_control_lock: true,
      video_passwd_exist: false,
    };
    robot.setActionOutput(21, 5, [{ piid: 7, value: JSON.stringify(status) }]);
    const subject = video(() => lanIo('5550003', miio));
    expect(await subject.open(deviceId, { sdp: OFFER })).toMatchObject({ status: 'live' });
    expect(robot.actions.map(({ siid, aiid }) => `${String(siid)}.${String(aiid)}`)).toStrictEqual([
      '21.5',
      '21.4',
    ]);
    expect(robot.writes).toStrictEqual([]);
  });
});
