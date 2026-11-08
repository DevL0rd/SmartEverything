import type { DesktopBridge } from '../../../design/platform';
import type { askToRestart } from '../data/restart-confirmation';

type InstallerBridge = Pick<DesktopBridge, 'installUpdate'>;

export async function confirmDesktopInstall(
  bridge: InstallerBridge,
  offer: { readonly version: string; readonly id: string },
  ask: typeof askToRestart,
  busy: () => boolean,
): Promise<void> {
  if (busy()) return;
  const accepted = await ask(
    {
      title: `Install desktop version ${offer.version}?`,
      body: 'SmartEverything closes and opens again after downloading.',
      confirmLabel: 'Install',
      cancelLabel: 'Later',
    },
    'desktop',
  );
  if (!accepted || busy()) return;
  await bridge.installUpdate(offer.id);
}
