import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { MemberOutcome } from '@smarteverything/domain';
import type { MemberNoun } from '../group-summary';
import {
  hasIssues,
  resultHeadline,
  resultLines,
  retryLabel,
  unreachableNote,
} from '../model/outcomes';

function Link({
  label,
  onPress,
  expanded,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly expanded?: boolean | undefined;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      expanded={expanded}
      className="min-h-touch-min justify-center rounded-xs px-1"
      layerClassName="rounded-xs"
    >
      <Text variant="footnote" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

function Details({
  outcomes,
  nameOf,
}: {
  readonly outcomes: readonly MemberOutcome[];
  readonly nameOf: (deviceId: string) => string;
}): ReactNode {
  const note = unreachableNote(outcomes, nameOf);
  return (
    <View className="gap-0.5 rounded-sm bg-surface-2 px-2.5 py-1.5">
      {resultLines(outcomes, nameOf).map((line) => (
        <Text key={line.deviceId} variant="footnote">
          {line.text}
        </Text>
      ))}
      {note === null ? null : (
        <Text variant="footnote" tone="variant">
          {note}
        </Text>
      )}
    </View>
  );
}

export function ResultLine({
  outcomes,
  noun,
  nameOf,
  onRetry,
  onDismiss,
}: {
  readonly outcomes: readonly MemberOutcome[];
  readonly noun: MemberNoun;
  readonly nameOf: (deviceId: string) => string;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!hasIssues(outcomes)) return null;
  const retry = retryLabel(outcomes, nameOf, noun);
  return (
    <View accessibilityLiveRegion="polite" className="gap-1">
      <View className="min-h-6 flex-row flex-wrap items-center gap-x-2">
        <Icon name="warning" size={16} colour="warning" />
        <Text variant="footnote" tone="variant">
          {resultHeadline(outcomes, noun)}
        </Text>
        <Link
          label="Details"
          expanded={open}
          onPress={() => {
            setOpen(!open);
          }}
        />
        {retry === null ? null : <Link label={retry} onPress={onRetry} />}
        <Link label="Dismiss" onPress={onDismiss} />
      </View>
      {open ? <Details outcomes={outcomes} nameOf={nameOf} /> : null}
    </View>
  );
}
