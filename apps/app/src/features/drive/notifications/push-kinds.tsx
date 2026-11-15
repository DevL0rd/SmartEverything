import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CLIENT_PREFS } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { usePref } from '../../../store/prefs';
import { KIND_LABEL, KIND_LOOK, PUSH_KIND_ORDER, pushKindsAfter } from './notification-model';

export const PUSH_KINDS_SETTING_ID = 'drive.notifications';

export const PUSH_KINDS_TITLE = 'Push to my phone';

export const PUSH_KINDS_CAPTION =
  'Every Drive notification shows in the inbox. Pick which ones also buzz your phone.';

export function PushKindsSetting(): ReactNode {
  const pref = usePref(CLIENT_PREFS.drive_notifications);
  if (pref.status === 'invalid') {
    return (
      <View className="gap-2">
        <Text variant="footnote" tone="critical">
          {`The saved push choices could not be read: ${pref.reason}`}
        </Text>
        <View className="flex-row">
          <Button label="Reset to every kind" variant="tonal" onPress={pref.reset} />
        </View>
      </View>
    );
  }
  const chosen = new Set(pref.value.pushKinds);
  return (
    <View role="list" aria-label={PUSH_KINDS_TITLE}>
      {PUSH_KIND_ORDER.map((kind) => (
        <SwitchRow
          key={kind}
          title={KIND_LABEL[kind]}
          icon={KIND_LOOK[kind].icon}
          iconTone={KIND_LOOK[kind].tone}
          value={chosen.has(kind)}
          onChange={(on) => {
            pref.set({ pushKinds: [...pushKindsAfter(pref.value.pushKinds, kind, on)] });
          }}
        />
      ))}
    </View>
  );
}
