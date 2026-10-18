import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { assignBodyReading } from '../../../api/people';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { dayLabel, clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useProfiles } from '../../../store/people';
import { useActiveProfileId, useTimeZone } from './use-scale';
import { choicesOf, queueStep, type AssignChoice, type AssignTarget } from './assign-model';

function ChoiceRow({
  choice,
  busy,
  onPick,
}: {
  readonly choice: AssignChoice;
  readonly busy: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={choice.label}
      selected={choice.selected}
      disabled={busy}
      onPress={onPick}
      className="min-h-touch-min flex-row items-center gap-3 rounded-lg px-3 py-2"
    >
      <Icon name={choice.profileId === null ? 'users' : 'user'} size={20} tone="variant" />
      <Text variant="callout" className="flex-1">
        {choice.label}
      </Text>
      {choice.selected ? <Icon name="check" size={20} tone="primary" /> : null}
    </Interactive>
  );
}

function Step({
  target,
  position,
  total,
  onDone,
}: {
  readonly target: AssignTarget;
  readonly position: number;
  readonly total: number;
  readonly onDone: () => void;
}): ReactNode {
  const now = useMinute();
  const zone = useTimeZone();
  const profiles = useProfiles();
  const mutation = useMutationState();
  const choices = choicesOf(target, profiles, useActiveProfileId());
  const when = `${dayLabel(target.iso, now, zone)} ${clock(target.iso, zone)}`;
  const place = total > 1 ? ` · ${String(position)} of ${String(total)}` : '';
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant">
        {`${when} · ${decimal(target.kg, 1)} kg${place}`}
      </Text>
      <View accessibilityRole="radiogroup" className="gap-1">
        {choices.map((choice) => (
          <ChoiceRow
            key={choice.profileId ?? 'guest'}
            choice={choice}
            busy={mutation.busy}
            onPick={() => {
              mutation.run(() => assignBodyReading(target.id, choice.profileId), {
                failure: 'The weigh-in was not saved',
                onDone,
              });
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function AssignSheet({
  queue,
  onClose,
}: {
  readonly queue: readonly AssignTarget[];
  readonly onClose: () => void;
}): ReactNode {
  const [total] = useState(queue.length);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const step = queueStep(queue, handled, total);
  if (step.current === null) {
    return null;
  }
  const { current } = step;
  const next = (): void => {
    const rest = queue.some((target) => target.id !== current.id && !handled.has(target.id));
    if (rest) {
      setHandled(new Set([...handled, current.id]));
      return;
    }
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Who was this?"
      detents={['fit']}
      footer={
        total > 1 ? (
          <Button label="Skip" variant="text" onPress={next} />
        ) : (
          <Button label="Cancel" variant="text" onPress={onClose} />
        )
      }
    >
      <Step
        key={current.id}
        target={current}
        position={step.position}
        total={step.total}
        onDone={next}
      />
    </Sheet>
  );
}
