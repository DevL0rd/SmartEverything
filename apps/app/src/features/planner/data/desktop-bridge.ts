import type {
  DesktopGoogleAnswer,
  DesktopGoogleAuthorize,
  DesktopGoogleLink,
} from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';

export function desktopGoogleLink(): DesktopGoogleLink | null {
  return desktopBridge()?.googleLink ?? null;
}

export async function authorizeGoogleOnDesktop(
  link: DesktopGoogleLink,
  consent: (redirectUri: string) => Promise<DesktopGoogleAuthorize>,
): Promise<DesktopGoogleAnswer> {
  const { redirectUri } = await link.open();
  try {
    return await link.authorize(await consent(redirectUri));
  } catch (cause) {
    await link.cancel();
    throw cause;
  }
}
