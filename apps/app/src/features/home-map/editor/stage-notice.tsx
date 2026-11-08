import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import type { IconName } from '../../../components/icon-glyphs';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { saveText, type HomeMapSaveStatus } from '../data/edits';
import type { EditorNotice } from './mount-edit';

export const WEBGL_NOTICE = '3D is not available on this device. Edit with the list.';

export const PAUSED_NOTICE = 'Offline · editing is paused';

export interface StageNoticeFacts {
  readonly unavailable: boolean;
  readonly readOnly: boolean;
  readonly status: HomeMapSaveStatus;
  readonly notice: EditorNotice | null;
}

function failureOf(status: HomeMapSaveStatus): string | null {
  return status.kind === 'not_saved' || status.kind === 'conflicts' ? saveText(status) : null;
}

export function stageNoticeOf(facts: StageNoticeFacts): EditorNotice | null {
  if (facts.unavailable) return { text: WEBGL_NOTICE, tone: 'warning' };
  if (facts.readOnly) return { text: PAUSED_NOTICE, tone: 'warning' };
  const failure = failureOf(facts.status);
  if (failure !== null) return { text: failure, tone: 'error' };
  return facts.notice;
}

const LOOK: Readonly<
  Record<EditorNotice['tone'], { readonly icon: IconName; readonly tone: Tone }>
> = {
  info: { icon: 'info', tone: 'primary' },
  warning: { icon: 'warning', tone: 'warning' },
  error: { icon: 'alert', tone: 'critical' },
};

export function StageNoticeChip({ notice }: { readonly notice: EditorNotice }): ReactNode {
  const look = LOOK[notice.tone];
  return (
    <View
      accessibilityRole={notice.tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      className="min-h-touch-min max-w-full shrink flex-row items-center gap-2 self-start rounded-lg border-hairline border-outline-variant bg-surface-raised px-3 py-2"
    >
      <Icon name={look.icon} size={16} tone={look.tone} />
      <Text variant="caption" className="shrink">
        {notice.text}
      </Text>
    </View>
  );
}
