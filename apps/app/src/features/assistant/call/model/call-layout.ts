import type { Idiom } from '../../../../design/tokens';

type CallLayoutKind = 'column' | 'side';

type SettingsPlacement = 'sheet' | 'panel';

export interface CallLayoutInput {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
}

export interface CallLayout {
  readonly kind: CallLayoutKind;
  readonly settings: SettingsPlacement;
  readonly floatingBar: boolean;
  readonly roomy: boolean;
  readonly orb: number;
}

const ORB_MIN = 160;
const ORB_MAX = 320;
const SHORT_HEIGHT = 560;
const ORB_SHORT_SHARE = 0.36;
const ORB_TALL_SHARE = 0.42;
const SHORT_ORB_SCALE = 0.75;
const PANEL_WIDTH = 840;
const ROOMY_WIDTH = 600;

export function callLayoutOf({ width, height, idiom }: CallLayoutInput): CallLayout {
  const short = height < SHORT_HEIGHT;
  const share = short ? ORB_SHORT_SHARE : ORB_TALL_SHARE;
  const orb = Math.max(
    ORB_MIN * (short ? SHORT_ORB_SCALE : 1),
    Math.min(ORB_MAX, Math.min(width, height) * share),
  );
  return {
    kind: short ? 'side' : 'column',
    settings: width >= PANEL_WIDTH ? 'panel' : 'sheet',
    floatingBar: idiom === 'pointer',
    roomy: width >= ROOMY_WIDTH,
    orb,
  };
}
