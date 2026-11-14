import { describe, expect, it, vi, type Mock } from 'vitest';
import type { GoogleLinkCalls } from './link-flow';
import {
  ApiError,
  type DesktopGoogleAnswer,
  type DesktopGoogleLink,
  type GoogleAccountRow,
} from '@smarteverything/domain';

const openAuthSessionAsync = vi.fn();
const platform = { OS: 'android' };

vi.mock('expo-web-browser', () => ({ openAuthSessionAsync }));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('../../../design/platform', () => ({ desktopBridge: (): null => null }));

const {
  ANDROID_REDIRECT_URI,
  GoogleLinkStateMismatchError,
  androidAnswer,
  deniedDetail,
  refusesClient,
  runGoogleLink,
} = await import('./link-flow');
const { ANDROID_CONSENT, desktopConsent, googleConsent } = await import('./link-flow-consent');

const ME = '00000000-0000-4000-8000-000000000001';
const AUTH_URL = 'https://accounts.google.test/o/oauth2/v2/auth?state=st-1';
const LOOPBACK = 'http://127.0.0.1:5123/google/callback';

const LINKED: GoogleAccountRow = {
  profile_id: ME,
  email: 'me@example.com',
  scopes: [],
  status: 'linked',
  problem: null,
  calendar_ids: [],
  list_ids: [],
  last_sync_at: null,
  last_error: null,
};

interface FakeHub {
  readonly start: Mock<GoogleLinkCalls['start']>;
  readonly finish: Mock<GoogleLinkCalls['finish']>;
}

function hub(finish: () => Promise<GoogleAccountRow> = () => Promise.resolve(LINKED)): FakeHub {
  return {
    start: vi
      .fn<GoogleLinkCalls['start']>()
      .mockResolvedValue({ authUrl: AUTH_URL, state: 'st-1' }),
    finish: vi.fn<GoogleLinkCalls['finish']>(finish),
  };
}

interface FakeDesktop {
  readonly bridge: DesktopGoogleLink;
  readonly authorize: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
}

function fakeDesktop(answer: (state: string) => DesktopGoogleAnswer): FakeDesktop {
  const authorize = vi.fn((input: { readonly state: string }) =>
    Promise.resolve(answer(input.state)),
  );
  const cancel = vi.fn(() => Promise.resolve());
  const bridge: DesktopGoogleLink = {
    open: () => Promise.resolve({ redirectUri: LOOPBACK }),
    authorize,
    cancel,
  };
  return { bridge, authorize, cancel };
}

function redirect(query: string): { readonly type: 'success'; readonly url: string } {
  return { type: 'success', url: `${ANDROID_REDIRECT_URI}?${query}` };
}

describe('google link flow on the desktop', () => {
  it('starts on the hub with the loopback redirect and finishes with the code Google sent back', async () => {
    const fake = hub();
    const link = fakeDesktop((state) => ({
      kind: 'code',
      code: 'c-9',
      state,
      redirectUri: LOOPBACK,
    }));
    const outcome = await runGoogleLink(desktopConsent(link.bridge), fake, ME);
    expect(fake.start).toHaveBeenCalledWith(ME, {
      platform: 'desktop',
      redirectUri: LOOPBACK,
      products: [
        { product: 'calendar', readOnly: false },
        { product: 'tasks', readOnly: false },
      ],
    });
    expect(link.authorize).toHaveBeenCalledWith({ authUrl: AUTH_URL, state: 'st-1' });
    expect(fake.finish).toHaveBeenCalledWith(ME, {
      code: 'c-9',
      state: 'st-1',
      redirectUri: LOOPBACK,
    });
    expect(outcome).toEqual({ kind: 'linked', account: LINKED });
  });

  it('reports a cancelled consent and never finishes', async () => {
    const fake = hub();
    const outcome = await runGoogleLink(
      desktopConsent(fakeDesktop(() => ({ kind: 'cancelled' })).bridge),
      fake,
      ME,
    );
    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(fake.finish).not.toHaveBeenCalled();
  });

  it('reports a denied consent with Google’s reason', async () => {
    const consent = desktopConsent(
      fakeDesktop(() => ({ kind: 'denied', reason: 'access_denied' })).bridge,
    );
    await expect(runGoogleLink(consent, hub(), ME)).resolves.toEqual({
      kind: 'denied',
      reason: 'access_denied',
    });
  });

  it('turns a client error on the redirect into a refused Desktop client', async () => {
    const consent = desktopConsent(
      fakeDesktop(() => ({ kind: 'denied', reason: 'invalid_client' })).bridge,
    );
    await expect(runGoogleLink(consent, hub(), ME)).resolves.toEqual({
      kind: 'refused_client',
      platform: 'desktop',
    });
  });

  it('cancels the loopback when the hub refuses to start the link', async () => {
    const link = fakeDesktop(() => ({ kind: 'cancelled' }));
    const fake = hub();
    const missing = new ApiError(
      'conflict',
      'Enter the Google client ids in the Google settings first.',
    );
    fake.start.mockRejectedValue(missing);
    await expect(runGoogleLink(desktopConsent(link.bridge), fake, ME)).rejects.toBe(missing);
    expect(link.cancel).toHaveBeenCalledOnce();
  });

  it('cancels through the desktop bridge', async () => {
    const link = fakeDesktop(() => ({ kind: 'cancelled' }));
    await desktopConsent(link.bridge).cancel?.();
    expect(link.cancel).toHaveBeenCalledOnce();
  });
});

describe('google link flow on Android', () => {
  it('opens Google in the browser with the package redirect and finishes with its code', async () => {
    openAuthSessionAsync.mockResolvedValueOnce(redirect('state=st-1&code=4%2F0Ab'));
    const fake = hub();
    const outcome = await runGoogleLink(ANDROID_CONSENT, fake, ME);
    expect(ANDROID_REDIRECT_URI).toBe('com.devl0rd.smarteverything.dev:/oauth2redirect');
    expect(fake.start).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ platform: 'android', redirectUri: ANDROID_REDIRECT_URI }),
    );
    expect(openAuthSessionAsync).toHaveBeenCalledWith(AUTH_URL, ANDROID_REDIRECT_URI);
    expect(fake.finish).toHaveBeenCalledWith(ME, {
      code: '4/0Ab',
      state: 'st-1',
      redirectUri: ANDROID_REDIRECT_URI,
    });
    expect(outcome.kind).toBe('linked');
  });

  it('is cancelled when the browser closes without a redirect', async () => {
    openAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' });
    const fake = hub();
    await expect(runGoogleLink(ANDROID_CONSENT, fake, ME)).resolves.toEqual({ kind: 'cancelled' });
    expect(fake.finish).not.toHaveBeenCalled();
  });

  it('becomes a refused Android client when the hub’s token exchange names the client', async () => {
    openAuthSessionAsync.mockResolvedValueOnce(redirect('state=st-1&code=c'));
    const fake = hub(() =>
      Promise.reject(
        new ApiError('upstream_failed', 'Google refused the sign-in.', 'invalid_client'),
      ),
    );
    await expect(runGoogleLink(ANDROID_CONSENT, fake, ME)).resolves.toEqual({
      kind: 'refused_client',
      platform: 'android',
    });
  });

  it('passes other finish failures on unchanged', async () => {
    openAuthSessionAsync.mockResolvedValueOnce(redirect('state=st-1&code=c'));
    const failure = new ApiError('upstream_failed', 'Google refused the sign-in.', 'invalid_grant');
    await expect(
      runGoogleLink(
        ANDROID_CONSENT,
        hub(() => Promise.reject(failure)),
        ME,
      ),
    ).rejects.toBe(failure);
  });

  it('is offered only on Android outside the desktop app', () => {
    expect(googleConsent()).toBe(ANDROID_CONSENT);
    platform.OS = 'ios';
    expect(googleConsent()).toBeNull();
    platform.OS = 'android';
  });
});

describe('android redirect answer', () => {
  it('rejects a redirect whose state belongs to another link', () => {
    expect(() => androidAnswer(redirect('state=other&code=c'), 'st-1')).toThrow(
      GoogleLinkStateMismatchError,
    );
  });

  it('reads Google’s error as a denial', () => {
    expect(androidAnswer(redirect('state=st-1&error=access_denied'), 'st-1')).toEqual({
      kind: 'denied',
      reason: 'access_denied',
    });
  });

  it('is a denial when the redirect carries no code', () => {
    expect(androidAnswer(redirect('state=st-1'), 'st-1')).toEqual({
      kind: 'denied',
      reason: 'no_code',
    });
  });
});

describe('refused client errors', () => {
  it('counts only upstream failures that name the client', () => {
    expect(refusesClient(new ApiError('upstream_failed', 'x', 'unauthorized_client'))).toBe(true);
    expect(refusesClient(new ApiError('upstream_failed', 'x', 'redirect_uri_mismatch'))).toBe(true);
    expect(refusesClient(new ApiError('upstream_failed', 'x', 'invalid_grant'))).toBe(false);
    expect(refusesClient(new ApiError('upstream_failed', 'x'))).toBe(false);
    expect(refusesClient(new ApiError('conflict', 'x', 'invalid_client'))).toBe(false);
    expect(refusesClient(new Error('invalid_client'))).toBe(false);
  });

  it('explains a denial in words', () => {
    expect(deniedDetail('access_denied')).toBe(
      'You didn’t allow SmartEverything to use your Google account.',
    );
    expect(deniedDetail('admin_policy_enforced')).toBe('Google answered admin_policy_enforced.');
  });
});
