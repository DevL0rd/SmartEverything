import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/text';

const SECTIONS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'What is kept',
    body: 'Your rooms and devices, what they report and its history, the commands you send, events such as doorbell presses, camera snapshots and clips, the phones you paired, your layouts, and the health records you choose to sync from Health Connect.',
  },
  {
    title: 'Where it is kept',
    body: 'In one database on the computer that runs the SmartEverything desktop app, and nowhere else. Paired phones reach it through the address you set up. Account passwords and keys are stored there encrypted and never leave that computer.',
  },
  {
    title: 'Health Connect',
    body: 'On Android you choose which kinds of health data to share. The app reads them, sends them to your own SmartEverything desktop, and uses them only for your fitness pages and the automations you create. Nothing is sold or shared with anyone.',
  },
  {
    title: 'AI assistants',
    body: 'If you connect Claude, ChatGPT or another assistant, it acts with the access you allowed. You can take that access back at any time in Settings › Assistant › Integrations.',
  },
  {
    title: 'Removing your data',
    body: 'Unpairing a phone in Settings › Paired devices stops its access at once. Everything else is removed by uninstalling the desktop app and deleting its data folder.',
  },
];

export function PrivacyContent(): ReactNode {
  return (
    <View className="gap-section-gap">
      {SECTIONS.map((section) => (
        <View key={section.title} className="gap-2">
          <Text variant="title-3" accessibilityRole="header">
            {section.title}
          </Text>
          <Text variant="body" tone="variant">
            {section.body}
          </Text>
        </View>
      ))}
    </View>
  );
}
