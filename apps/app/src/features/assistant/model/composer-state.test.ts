import { describe, expect, it } from 'vitest';
import {
  OFFLINE_STATUS,
  engineSteersTurns,
  effortSteps,
  queuedLabel,
  trayRowOf,
  sendClearing,
  sendModeOf,
  statusOf,
  uploadsSummary,
  wantsEditor,
  type SendFacts,
  type StatusFacts,
} from './composer-state';

function effects(): { readonly log: string[]; readonly value: Parameters<typeof sendClearing>[1] } {
  const log: string[] = [];
  return {
    log,
    value: {
      clear: () => log.push('clear'),
      restore: () => log.push('restore'),
      sent: () => log.push('sent'),
    },
  };
}

describe('sendClearing', () => {
  it('clears the input before the delivery settles', async () => {
    const seen = effects();
    let finish: (delivered: boolean) => void = () => undefined;
    const done = sendClearing(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      seen.value,
    );
    expect(seen.log).toEqual(['clear']);
    finish(true);
    await done;
    expect(seen.log).toEqual(['clear', 'sent']);
  });

  it('puts the text back when the delivery fails', async () => {
    const seen = effects();
    await sendClearing(() => Promise.resolve(false), seen.value);
    expect(seen.log).toEqual(['clear', 'restore']);
  });
});

const IDLE: SendFacts = {
  hasContent: false,
  uploading: false,
  working: false,
  blocked: false,
  offline: false,
  steerable: false,
};

describe('sendModeOf', () => {
  it('shows a disabled arrow for an empty field when nothing runs', () => {
    expect(sendModeOf(IDLE)).toBe('idle');
  });

  it('shows the send arrow once there is text or a ready attachment', () => {
    expect(sendModeOf({ ...IDLE, hasContent: true })).toBe('send');
  });

  it('shows the progress ring while attachments still upload', () => {
    expect(sendModeOf({ ...IDLE, hasContent: true, uploading: true })).toBe('uploading');
  });

  it('shows only Stop while a reply runs and the field is empty', () => {
    expect(sendModeOf({ ...IDLE, working: true })).toBe('stop');
  });

  it('shows Stop and Queue while a reply runs and there is a message', () => {
    expect(sendModeOf({ ...IDLE, working: true, hasContent: true })).toBe('queue');
  });

  it('shows Steer instead of Queue when the engine takes a message into a running reply', () => {
    expect(sendModeOf({ ...IDLE, working: true, hasContent: true, steerable: true })).toBe('steer');
  });

  it('takes a message into a running reply for Claude chats and not for Codex', () => {
    expect(engineSteersTurns('claude')).toBe(true);
    expect(engineSteersTurns('dsh')).toBe(true);
    expect(engineSteersTurns('openrouter')).toBe(true);
    expect(engineSteersTurns('codex')).toBe(false);
  });

  it('never shows Steer without a message, when blocked, or when idle', () => {
    expect(sendModeOf({ ...IDLE, working: true, steerable: true })).toBe('stop');
    expect(
      sendModeOf({ ...IDLE, working: true, hasContent: true, blocked: true, steerable: true }),
    ).toBe('stop');
    expect(sendModeOf({ ...IDLE, hasContent: true, steerable: true })).toBe('send');
  });

  it('keeps only Stop while a reply runs and the message cannot be sent', () => {
    expect(sendModeOf({ ...IDLE, working: true, hasContent: true, blocked: true })).toBe('stop');
  });

  it('hides Stop and queues for the outbox when the hub is unreachable', () => {
    expect(sendModeOf({ ...IDLE, working: true, hasContent: true, offline: true })).toBe('send');
    expect(sendModeOf({ ...IDLE, working: true, offline: true })).toBe('idle');
  });

  it('disables the arrow when a message cannot be sent', () => {
    expect(sendModeOf({ ...IDLE, hasContent: true, blocked: true })).toBe('blocked');
  });

  it('keeps an empty blocked field as a plain disabled arrow', () => {
    expect(sendModeOf({ ...IDLE, blocked: true })).toBe('idle');
  });
});

const CLEAR: StatusFacts = {
  engineReason: null,
  profileName: null,
  attachmentReason: null,
  failedUploads: 0,
  armedUploads: 0,
  offline: false,
};

describe('statusOf', () => {
  it('shows nothing when nothing is wrong', () => {
    expect(statusOf(CLEAR)).toBeNull();
  });

  it('puts the engine reason before every other line', () => {
    const everything: StatusFacts = {
      engineReason: 'Workstation is offline',
      profileName: 'Alex',
      attachmentReason: 'Codex cannot read report.pdf',
      failedUploads: 2,
      armedUploads: 1,
      offline: true,
    };
    expect(statusOf(everything)).toEqual({ kind: 'engine', text: 'Workstation is offline' });
  });

  it('puts the profile mismatch after the engine reason and before attachment problems', () => {
    const facts = { ...CLEAR, profileName: 'Alex', attachmentReason: 'Codex cannot read it' };
    expect(statusOf(facts)).toEqual({ kind: 'profile', text: 'This chat belongs to Alex.' });
    expect(statusOf({ ...facts, engineReason: 'Workstation is offline' })?.kind).toBe('engine');
  });

  it('puts attachment problems before the waiting-for-uploads line', () => {
    const facts = { ...CLEAR, attachmentReason: 'Codex cannot read report.pdf', armedUploads: 1 };
    expect(statusOf(facts)).toEqual({ kind: 'attachment', text: 'Codex cannot read report.pdf' });
  });

  it('names failed uploads and what to do about them', () => {
    expect(statusOf({ ...CLEAR, failedUploads: 1 })?.text).toBe(
      'One file didn’t upload. Retry or remove it to send.',
    );
    expect(statusOf({ ...CLEAR, failedUploads: 1 })?.kind).toBe('failedUpload');
    expect(statusOf({ ...CLEAR, failedUploads: 3 })?.text).toBe(
      '3 files didn’t upload. Retry or remove them to send.',
    );
  });

  it('says how many uploads the message waits for', () => {
    expect(statusOf({ ...CLEAR, armedUploads: 1 })).toEqual({
      kind: 'uploading',
      text: 'Sends when 1 upload finishes',
    });
    expect(statusOf({ ...CLEAR, armedUploads: 2 })?.text).toBe('Sends when 2 uploads finish');
  });

  it('puts the waiting-for-uploads line before the offline line', () => {
    expect(statusOf({ ...CLEAR, armedUploads: 1, offline: true })?.kind).toBe('uploading');
  });

  it('explains offline sending last', () => {
    expect(statusOf({ ...CLEAR, offline: true })).toEqual({
      kind: 'offline',
      text: OFFLINE_STATUS,
    });
  });
});

describe('uploadsSummary', () => {
  it('counts pending and failed uploads and averages pending progress', () => {
    const summary = uploadsSummary([
      { state: 'uploading', progress: 0.5 },
      { state: 'uploading', progress: 0.1 },
      { state: 'failed', progress: 0.9 },
      { state: 'done', progress: 1 },
    ]);
    expect(summary.pending).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.progress).toBeCloseTo(0.3);
  });

  it('reports a full ring when nothing is pending', () => {
    expect(uploadsSummary([{ state: 'done', progress: 1 }]).progress).toBe(1);
    expect(uploadsSummary([]).progress).toBe(1);
  });
});

describe('effortSteps', () => {
  it('maps the effort words to the three meter steps', () => {
    expect(effortSteps('Low')).toBe(1);
    expect(effortSteps('Medium')).toBe(2);
    expect(effortSteps('High')).toBe(3);
    expect(effortSteps('Max')).toBe(3);
  });

  it('draws no meter for the default or an unknown effort', () => {
    expect(effortSteps(null)).toBeNull();
    expect(effortSteps('Default')).toBeNull();
  });
});

describe('queuedLabel', () => {
  it('shows the message text, or the file count when there is none', () => {
    expect(queuedLabel('dim the lamp', 0)).toBe('dim the lamp');
    expect(queuedLabel('', 1)).toBe('1 file');
    expect(queuedLabel('', 3)).toBe('3 files');
  });
});

describe('wantsEditor', () => {
  it('offers the full editor above four lines or 240 characters', () => {
    expect(wantsEditor('one\ntwo\nthree\nfour')).toBe(false);
    expect(wantsEditor('one\ntwo\nthree\nfour\nfive')).toBe(true);
    expect(wantsEditor('x'.repeat(240))).toBe(false);
    expect(wantsEditor('x'.repeat(241))).toBe(true);
  });
});

describe('trayRowOf', () => {
  const waiting = {
    text: 'dim the lamp',
    attachments: [],
  } as const;
  const idle = { fieldHasText: false, delivering: false };

  it('says a waiting message waits for the connection and offers edit and remove only', () => {
    expect(trayRowOf(waiting, idle)).toEqual({
      text: 'Waiting for connection · “dim the lamp”',
      edit: 'enabled',
      remove: true,
    });
  });

  it('blocks edit while the field has text and hides it when files are attached', () => {
    expect(trayRowOf(waiting, { ...idle, fieldHasText: true }).edit).toBe('blocked');
    expect(trayRowOf({ ...waiting, attachments: ['a'] }, idle).edit).toBe('absent');
    expect(
      trayRowOf({ ...waiting, text: '', attachments: ['a'] }, { ...idle, fieldHasText: true }).edit,
    ).toBe('absent');
  });

  it('offers nothing to change while the message is being delivered', () => {
    expect(trayRowOf(waiting, { ...idle, delivering: true })).toEqual({
      text: 'Sending · “dim the lamp”',
      edit: 'absent',
      remove: false,
    });
  });
});
