import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Head from 'expo-router/head';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { IconButton } from './icon-button';
import { ProgressSteps, type ProgressStep } from './progress-steps';
import { Text } from './text';
import { useEscape } from './use-escape';

export interface FlowFrameProps {
  readonly title: string;
  readonly steps?: readonly ProgressStep[];
  readonly footer?: ReactNode;
  readonly onCancel: () => void;
  readonly wide?: boolean;
  readonly children: ReactNode;
}

function FlowBody({
  steps,
  children,
}: {
  readonly steps: readonly ProgressStep[] | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-6">
      {steps === undefined ? null : <ProgressSteps steps={steps} />}
      {children}
    </View>
  );
}

function TouchFlow({ title, steps, footer, onCancel, children }: FlowFrameProps): ReactNode {
  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-bg">
      <View className="h-app-bar mt-safe flex-row items-center gap-1 px-1">
        <IconButton icon="close" label="Cancel" onPress={onCancel} />
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="flex-1">
          {title}
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-gutter pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-reading self-center">
          <FlowBody steps={steps}>{children}</FlowBody>
        </View>
      </ScrollView>
      {footer === undefined ? null : (
        <View className="border-t border-outline-variant px-gutter pt-3 pb-safe-offset-3">
          <View className="w-full max-w-reading flex-row gap-3 self-center">{footer}</View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function DialogFlow({
  title,
  steps,
  footer,
  onCancel,
  wide = false,
  children,
}: FlowFrameProps): ReactNode {
  useEscape(true, onCancel);
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={onCancel}
        className="absolute inset-0 bg-scrim"
      />
      <View
        accessibilityViewIsModal
        aria-modal
        className={cn(
          'max-h-full w-full overflow-hidden rounded-xl bg-surface-raised elevation-3',
          wide ? 'max-w-dialog-wide' : 'max-w-dialog',
        )}
      >
        <View className="flex-row items-center gap-2 pb-2 pl-6 pr-2 pt-4">
          <Text variant="title-2" accessibilityRole="header" className="flex-1">
            {title}
          </Text>
          <IconButton icon="close" label="Cancel" onPress={onCancel} shortcut="Esc" />
        </View>
        <ScrollView className="shrink" contentContainerClassName="px-6 pb-6">
          <FlowBody steps={steps}>{children}</FlowBody>
        </ScrollView>
        {footer === undefined ? null : (
          <View className="flex-row justify-end gap-2 border-t border-outline-variant px-6 py-4">
            {footer}
          </View>
        )}
      </View>
    </View>
  );
}

export function FlowFrame(props: FlowFrameProps): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <>
      <Head>
        <title>{`${props.title} · SmartEverything`}</title>
      </Head>
      {touch ? <TouchFlow {...props} /> : <DialogFlow {...props} />}
    </>
  );
}
