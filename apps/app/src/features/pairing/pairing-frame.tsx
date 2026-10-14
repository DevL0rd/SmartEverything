import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Head from 'expo-router/head';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';

export function PairingFrame({
  title,
  body,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="grow items-center justify-center px-gutter pt-safe-offset-8 pb-safe-offset-8"
      keyboardShouldPersistTaps="handled"
    >
      <Head>
        <title>Connect · SmartEverything</title>
      </Head>
      <View className="w-full max-w-dialog gap-8">
        <View className="items-center gap-3">
          <View className="size-16 items-center justify-center rounded-full bg-primary-container">
            <Icon name="home" size={32} tone="primary" />
          </View>
          <Text variant="title-1" align="center" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="variant" align="center">
            {body}
          </Text>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
