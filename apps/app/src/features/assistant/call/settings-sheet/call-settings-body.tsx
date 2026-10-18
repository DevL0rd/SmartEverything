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
import {
  CALL_AUDIO_SECTIONS,
  CALL_AUDIO_SETTINGS,
  CALL_PANEL_SECTIONS,
} from '../../settings/call-audio-settings';
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

function Masthead({ call, onClose }: CallSettingsBodyProps): ReactNode {
  const name = useAssistantName();
  return (
    <View className="gap-3">
      <SheetHeader onClose={onClose} />
      <LiveStrip call={call} name={name} />
    </View>
  );
}

function Sections({ call }: { readonly call: CallView }): ReactNode {
  const name = useAssistantName();
  const { reset, pref } = useCallAudio();
  return (
    <View className="gap-section-gap">
      {CALL_PANEL_SECTIONS.map((section) => (
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
    </View>
  );
}

export function CallSettingsSheetBody({ call, onClose }: CallSettingsBodyProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <Masthead call={call} onClose={onClose} />
      <Sections call={call} />
    </View>
  );
}

export function CallSettingsPanelBody({ call, onClose }: CallSettingsBodyProps): ReactNode {
  return (
    <View className="min-h-0 flex-1 gap-3">
      <View className="px-4">
        <Masthead call={call} onClose={onClose} />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="px-4 pb-6">
        <Sections call={call} />
      </ScrollView>
    </View>
  );
}
