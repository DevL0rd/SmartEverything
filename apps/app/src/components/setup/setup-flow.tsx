import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { Button } from '../button';
import { FlowFrame } from '../flow-frame';
import { Text } from '../text';
import { useIdiom } from '../../design/platform';
import { StepBar, type StepBarStep } from './step-bar';

export interface SetupAction {
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: Href;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

export interface SetupFlowProps {
  readonly title: string;
  readonly steps: readonly StepBarStep[];
  readonly heading: string;
  readonly reason?: string;
  readonly primary: SetupAction;
  readonly secondary?: SetupAction;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}

function FooterButtons({
  primary,
  secondary,
}: Pick<SetupFlowProps, 'primary' | 'secondary'>): ReactNode {
  const grow = useIdiom() === 'touch';
  return (
    <>
      {secondary === undefined ? null : <Button {...secondary} variant="text" grow={grow} />}
      <Button {...primary} grow={grow} />
    </>
  );
}

export function SetupFlow({
  title,
  steps,
  heading,
  reason,
  primary,
  secondary,
  onCancel,
  children,
}: SetupFlowProps): ReactNode {
  return (
    <FlowFrame
      title={title}
      onCancel={onCancel}
      wide
      footer={
        <FooterButtons primary={primary} {...(secondary === undefined ? {} : { secondary })} />
      }
    >
      <StepBar steps={steps} />
      <View className="gap-1">
        <Text variant="title-2" accessibilityRole="header">
          {heading}
        </Text>
        {reason === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {reason}
          </Text>
        )}
      </View>
      {children}
    </FlowFrame>
  );
}
