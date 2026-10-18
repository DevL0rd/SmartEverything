import type { IconName } from '../../../../components/icon-glyphs';
import { NATIVE_OWNER_REASON } from '../../provider/provider-access';

export const STOP_REASON = 'Stop the reply to change the model.';
export const RECONNECTING_NOTE = 'Reconnecting… choices will update.';

export interface PanelReason {
  readonly text: string;
  readonly icon: IconName;
}

export interface PanelReasonInput {
  readonly blocked: boolean;
  readonly readOnly: boolean;
  readonly ready: boolean;
}

export function panelReasonOf({ blocked, readOnly, ready }: PanelReasonInput): PanelReason | null {
  if (readOnly) return { text: NATIVE_OWNER_REASON, icon: 'lock' };
  if (!ready) return { text: RECONNECTING_NOTE, icon: 'info' };
  return blocked ? { text: STOP_REASON, icon: 'info' } : null;
}
