import { closeFlow } from '../../../app-shell/close-flow';
import { notify } from '../../../components/toast-store';
import { localPref } from '../../../store/local-prefs';
import { overlayStatus } from './overlay-native';
import { showOverlaySettings } from './overlay-permission-row';
import { overlayPlatform } from './overlay-surface';

type MinimizeStep = 'leave' | 'allow' | 'enable';

interface MinimizeFacts {
  readonly platform: 'desktop' | 'phone';
  readonly enabled: boolean;
  readonly canDraw: boolean | null;
}

export class MinimizeUnavailable extends Error {
  constructor() {
    super('This device has no voice overlay to hand the call to');
  }
}

export function minimizeStep(facts: MinimizeFacts): MinimizeStep {
  if (!facts.enabled) {
    return 'enable';
  }
  return facts.platform === 'phone' && facts.canDraw === false ? 'allow' : 'leave';
}

export function canMinimizeCall(): boolean {
  return overlayPlatform() !== null;
}

export function minimizeCall(): void {
  const platform = overlayPlatform();
  if (platform === null) {
    throw new MinimizeUnavailable();
  }
  const step = minimizeStep({
    platform,
    enabled: localPref('overlay').enabled,
    canDraw: platform === 'phone' ? (overlayStatus()?.canDrawOverlays ?? null) : null,
  });
  switch (step) {
    case 'enable':
      notify({ message: 'Turn on Show voice overlay in the assistant settings to keep talking' });
      return;
    case 'allow':
      showOverlaySettings();
      return;
    case 'leave':
      closeFlow('/');
  }
}
