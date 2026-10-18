import type { ReactNode } from 'react';
import { ReasonLine } from './reason-line';

export interface ProfileGateProps {
  readonly profileName: string;
  readonly onSwitch: () => void;
}

export function ProfileGate({ profileName, onSwitch }: ProfileGateProps): ReactNode {
  return (
    <ReasonLine
      icon="user"
      text={`Belongs to ${profileName}`}
      action={{ label: 'Switch profile', onPress: onSwitch }}
    />
  );
}
