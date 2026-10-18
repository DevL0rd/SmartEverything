import { mountGlow } from './overlay-glow-page';
import { PillPage } from './overlay-pill-page';
import { TrayPage } from './overlay-tray-page';
import type { OverlayBridge, OverlayPageState } from '../overlay-messages';

declare global {
  interface Window {
    readonly overlay: OverlayBridge;
  }
}

const MOUNTS: Readonly<
  Record<
    OverlayBridge['role'],
    (bridge: OverlayBridge, root: HTMLElement) => (state: OverlayPageState) => void
  >
> = {
  glow: mountGlow,
  pill: (bridge, root) => {
    const page = new PillPage(bridge, root);
    return (state) => {
      page.render(state);
    };
  },
  tray: (bridge, root) => {
    const page = new TrayPage(bridge, root);
    return (state) => {
      page.render(state);
    };
  },
};

const FONT_FAMILIES = ['Geist-Regular', 'Geist-Medium', 'Geist-SemiBold'] as const;

function mount(overlay: OverlayBridge, root: HTMLElement): void {
  const render = MOUNTS[overlay.role](overlay, root);
  let latest: OverlayPageState | null = null;
  overlay.onState((state) => {
    latest = state;
    render(state);
  });
  document.fonts.addEventListener('loadingdone', () => {
    if (latest !== null) {
      render(latest);
    }
  });
  overlay.ready();
}

function start(): void {
  const root = document.getElementById('ov');
  if (root === null) {
    throw new Error('the overlay page needs an element with id "ov"; received none');
  }
  const { overlay } = window;
  Promise.all(FONT_FAMILIES.map((family) => document.fonts.load(`15px ${family}`)))
    .catch((error: unknown) => {
      reportError(error);
    })
    .then(() => {
      mount(overlay, root);
    })
    .catch((error: unknown) => {
      reportError(error);
    });
}

start();
