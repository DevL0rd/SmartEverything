import type { DesktopGoogleLink } from '@smarteverything/domain';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { authorizeGoogleOnDesktop, desktopGoogleLink } from '../../planner/data/desktop-bridge';
import { ANDROID_REDIRECT_URI, androidAnswer, type GoogleConsent } from './link-flow';

export function desktopConsent(link: DesktopGoogleLink): GoogleConsent {
  return {
    platform: 'desktop',
    authorize: (begin) => authorizeGoogleOnDesktop(link, begin),
    cancel: () => link.cancel(),
  };
}

export const ANDROID_CONSENT: GoogleConsent = {
  platform: 'android',
  authorize: async (begin) => {
    const started = await begin(ANDROID_REDIRECT_URI);
    const result = await WebBrowser.openAuthSessionAsync(started.authUrl, ANDROID_REDIRECT_URI);
    return androidAnswer(result, started.state);
  },
  cancel: null,
};

export function googleConsent(): GoogleConsent | null {
  const desktop = desktopGoogleLink();
  if (desktop !== null) return desktopConsent(desktop);
  return Platform.OS === 'android' ? ANDROID_CONSENT : null;
}
