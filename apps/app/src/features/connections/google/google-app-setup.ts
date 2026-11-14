import identity from '../../../../app-identity.json';

export const ANDROID_PACKAGE: string = identity.applicationId;

export type GoogleClientPlatform = 'android' | 'desktop';

export interface GoogleAppDraft {
  readonly androidClientId: string;
  readonly desktopClientId: string;
  readonly desktopClientSecret: string;
}

export const EMPTY_APP_DRAFT: GoogleAppDraft = {
  androidClientId: '',
  desktopClientId: '',
  desktopClientSecret: '',
};

export function draftReady(draft: GoogleAppDraft): boolean {
  const { androidClientId, desktopClientId, desktopClientSecret } = draft;
  return [androidClientId, desktopClientId, desktopClientSecret].every(
    (value) => value.trim() !== '',
  );
}

export function trimmedDraft(draft: GoogleAppDraft): GoogleAppDraft {
  return {
    androidClientId: draft.androidClientId.trim(),
    desktopClientId: draft.desktopClientId.trim(),
    desktopClientSecret: draft.desktopClientSecret.trim(),
  };
}

export function setupSteps(packageName: string): string {
  return [
    'Set up your own Google app for SmartEverything',
    '1. In the Google Cloud console, create a project and enable the Google Calendar API and the Google Tasks API.',
    '2. Set up the OAuth consent screen and set its publishing status to In production, or Google signs you out after 7 days.',
    `3. Create an OAuth client of type Android with the package name ${packageName} and the SHA-1 fingerprint of the app's signing certificate.`,
    '4. Create an OAuth client of type Desktop app and copy its client ID and client secret.',
    '5. Enter the Android client ID, the Desktop client ID and the Desktop client secret in Settings › Accounts › Google, then save.',
  ].join('\n');
}

export const REFUSED_CLIENT: Readonly<
  Record<GoogleClientPlatform, { readonly title: string; readonly body: string }>
> = {
  android: {
    title: 'Google refused the Android client',
    body: 'The client ID is not set up for this app. Check the package name below and the SHA-1 of the app’s signing certificate, then link again.',
  },
  desktop: {
    title: 'Google refused the Desktop client',
    body: 'The Desktop client ID or secret is not set up for this app. Check them below, then link again.',
  },
};
