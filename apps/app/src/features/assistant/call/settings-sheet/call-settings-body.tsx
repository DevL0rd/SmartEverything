import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../../app-shell/hrefs';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { appPlatform, type AppPlatform } from '../../../../design/platform';
import { SettingsRow } from '../../../../settings/settings-row';
import type { SettingDefinition } from '../../../../settings/types';
import { useAssistantName } from '../../data/assistant-data';
import { CALL_AUDIO_SECTIONS, CALL_AUDIO_SETTINGS } from '../../settings/call-audio-settings';
import { useAppliedNote } from '../applied-note';
import type { CallView } from '../call-state';
import { useCallAudio } from './call-audio-pref';
import { LiveStrip } from './live-strip';
import { StillsLog } from './video-rows';

const WHERE: Readonly<Record<AppPlatform, string>> = {
  android: 'On this phone',
  desktop: 'On this computer',
  web: 'In this browser',
};

const SECTIONS = [
  CALL_AUDIO_SECTIONS.listening,
  CALL_AUDIO_SECTIONS.echo,
  CALL_AUDIO_SECTIONS.devices,
  CALL_AUDIO_SECTIONS.video,
] as const;

function rowsOf(section: string): readonly SettingDefinition[] {
  return CALL_AUDIO_SETTINGS.filter((setting) => setting.section === section);
}

function SheetHeader({ onClose }: { readonly onClose: () => void }): ReactNode {
  const note = useAppliedNote();
  return (
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1">
        <Text variant="title-2" accessibilityRole="header">
          Call settings
        </Text>
        <Text
          variant="footnote"
          tone={note === null ? 'variant' : 'primary'}
          accessibilityLiveRegion="polite"
          numberOfLines={1}
        >
          {note ?? `${WHERE[appPlatform()]} · applies now`}
        </Text>
      </View>
      <IconButton icon="close" label="Close call settings" onPress={onClose} shortcut="Esc" />
    </View>
  );
}

export interface CallSettingsBodyProps {
  readonly call: CallView;
  readonly onClose: () => void;
}

export function CallSettingsBody({ call, onClose }: CallSettingsBodyProps): ReactNode {
  const name = useAssistantName();
  const { reset, pref } = useCallAudio();
  return (
    <View className="min-h-0 flex-1 gap-3">
      <View className="gap-3 px-4">
        <SheetHeader onClose={onClose} />
        <LiveStrip call={call} name={name} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-section-gap px-4 pb-6">
        {SECTIONS.map((section) => (
          <List
            key={section}
            title={section === CALL_AUDIO_SECTIONS.video ? `What ${name} sees` : section}
          >
            {rowsOf(section).map((setting) => (
              <SettingsRow key={setting.id} setting={setting} />
            ))}
            {section === CALL_AUDIO_SECTIONS.video &&
            (pref.video_mode === 'on_demand' || call.looks.length > 0) ? (
              <StillsLog key="stills" />
            ) : null}
          </List>
        ))}
        <View className="gap-2">
          <Button label="Reset to defaults" variant="text" onPress={reset} />
          <Button
            label="Voice, model and more in Settings"
            variant="text"
            icon="externalLink"
            onPress={() => {
              router.push(href.settings.page('assistant'));
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}
