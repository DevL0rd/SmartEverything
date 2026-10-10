import { describe, expect, it } from 'vitest';
import { deepLinkInArguments, parseDeepLink } from '../src/deep-link.js';
import {
  DeepLinkInbox,
  type DeepLinkRecipient,
  type DeepLinkRefusal,
} from '../src/deep-link-inbox.js';

const CALLBACK = 'smarteverything://auth/callback?code=abc&state=xyz';

describe('parseDeepLink', () => {
  it('parseDeepLink accepts the auth callback with its query', () => {
    expect(parseDeepLink(CALLBACK)).toEqual({ kind: 'accepted', url: CALLBACK });
  });

  it('parseDeepLink accepts the auth callback with a trailing slash', () => {
    expect(parseDeepLink('smarteverything://auth/callback/#access_token=t').kind).toBe('accepted');
  });

  it('parseDeepLink refuses another scheme', () => {
    expect(parseDeepLink('https://auth/callback')).toEqual({
      kind: 'refused',
      reason: 'the scheme is not smarteverything:',
      received: 'https://auth/callback',
    });
  });

  it('parseDeepLink refuses a route the app does not handle', () => {
    expect(parseDeepLink('smarteverything://settings/delete-account')).toEqual({
      kind: 'refused',
      reason: 'the route settings/delete-account is not handled',
      received: 'smarteverything://settings/delete-account',
    });
  });

  it('parseDeepLink refuses text that is not a URL', () => {
    expect(parseDeepLink('not a link').kind).toBe('refused');
  });

  it('parseDeepLink refuses an oversized link and echoes only its start', () => {
    const huge = `${CALLBACK}&pad=${'a'.repeat(5000)}`;
    expect(parseDeepLink(huge)).toEqual({
      kind: 'refused',
      reason: 'the link is too long',
      received: huge.slice(0, 64),
    });
  });
});

describe('deepLinkInArguments', () => {
  it('deepLinkInArguments finds the link among Chromium switches', () => {
    expect(deepLinkInArguments(['/usr/bin/smarteverything', '--no-sandbox', CALLBACK])).toBe(
      CALLBACK,
    );
  });

  it('deepLinkInArguments answers undefined when no link was passed', () => {
    expect(deepLinkInArguments(['/usr/bin/smarteverything', '--hidden'])).toBeUndefined();
  });
});

class RecordingRecipient implements DeepLinkRecipient {
  readonly sent: string[] = [];
  destroyed = false;

  send(_channel: 'desktop:deep-link', url: string): void {
    this.sent.push(url);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

describe('DeepLinkInbox', () => {
  it('DeepLinkInbox holds links until the renderer takes them, then forwards live', () => {
    const inbox = new DeepLinkInbox(() => {
      throw new Error('no refusal expected');
    });
    inbox.receive(CALLBACK);
    const recipient = new RecordingRecipient();
    expect(inbox.take(recipient)).toEqual([CALLBACK]);
    expect(inbox.take(recipient)).toEqual([]);
    inbox.receive(`${CALLBACK}2`);
    expect(recipient.sent).toEqual([`${CALLBACK}2`]);
  });

  it('DeepLinkInbox queues again once the renderer is destroyed', () => {
    const inbox = new DeepLinkInbox(() => {
      throw new Error('no refusal expected');
    });
    const recipient = new RecordingRecipient();
    inbox.take(recipient);
    recipient.destroyed = true;
    inbox.receive(CALLBACK);
    expect(recipient.sent).toEqual([]);
    expect(inbox.take(new RecordingRecipient())).toEqual([CALLBACK]);
  });

  it('DeepLinkInbox reports a refused link and never forwards it', () => {
    const refusals: DeepLinkRefusal[] = [];
    const inbox = new DeepLinkInbox((refusal) => refusals.push(refusal));
    inbox.receive('smarteverything://elsewhere');
    expect(refusals).toEqual([
      {
        kind: 'refused',
        reason: 'the route elsewhere is not handled',
        received: 'smarteverything://elsewhere',
      },
    ]);
    expect(inbox.take(new RecordingRecipient())).toEqual([]);
  });
});
