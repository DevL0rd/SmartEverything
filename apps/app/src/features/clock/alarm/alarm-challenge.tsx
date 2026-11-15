import type { PlannerChallenge } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { AlarmDraft, AlarmEdit } from './alarm-draft';
import {
  CHALLENGE_OPTIONS,
  challengeNotesOf,
  challengeOfKind,
  challengeSummaryOf,
  type ChallengePlaces,
} from './challenge-draft';
import { MathsFields, QrFields, StepsFields } from './challenge-fields';

export interface ChallengeProps {
  readonly draft: AlarmDraft;
  readonly disabled: boolean;
  readonly places: ChallengePlaces;
  readonly onChange: (edit: AlarmEdit) => void;
}

function ChallengeBody({
  challenge,
  disabled,
  onPick,
}: {
  readonly challenge: PlannerChallenge;
  readonly disabled: boolean;
  readonly onPick: (challenge: PlannerChallenge) => void;
}): ReactNode {
  const shared = { disabled, onPick };
  switch (challenge.kind) {
    case 'none':
      return null;
    case 'maths':
      return <MathsFields {...shared} challenge={challenge} />;
    case 'qr':
      return <QrFields registered disabled={disabled} onPick={onPick} />;
    case 'steps':
      return <StepsFields {...shared} steps={challenge.steps} />;
  }
}

function Note({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name="info" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

export function AlarmChallenge({ draft, disabled, places, onChange }: ChallengeProps): ReactNode {
  const [scanFirst, setScanFirst] = useState(false);
  const challenge = draft.challenge;
  const onPick = (next: PlannerChallenge): void => {
    setScanFirst(false);
    onChange({ challenge: next });
  };
  const shown = scanFirst ? 'qr' : challenge.kind;
  return (
    <View className="gap-3 px-4 py-3">
      <Segmented
        label="Dismiss challenge"
        options={CHALLENGE_OPTIONS}
        value={shown}
        disabled={disabled}
        fill
        onChange={(kind) => {
          const next = challengeOfKind(kind, challenge);
          if (next === null) setScanFirst(true);
          else onPick(next);
        }}
      />
      <Text variant="footnote" tone="variant">
        {scanFirst ? 'Scan a code to use it as the challenge.' : challengeSummaryOf(challenge)}
      </Text>
      {scanFirst ? (
        <QrFields registered={false} disabled={disabled} onPick={onPick} />
      ) : (
        <ChallengeBody challenge={challenge} disabled={disabled} onPick={onPick} />
      )}
      {challengeNotesOf(challenge, places).map((note) => (
        <Note key={note} text={note} />
      ))}
    </View>
  );
}
