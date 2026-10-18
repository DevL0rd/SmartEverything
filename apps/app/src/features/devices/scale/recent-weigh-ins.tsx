import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { assignBodyReading } from '../../../api/people';
import { Badge } from '../../../components/badge';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { List } from '../../../components/section';
import { kilograms } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { AssignSheet } from './assign-sheet';
import { targetOfWeighIn, type AssignTarget } from './assign-model';
import { attributionLook } from './attribution-model';
import type { Scale } from './use-scale';
import type { WeighIn } from './weigh-ins';

const RECENT_COUNT = 8;

function Row({
  weighIn,
  scale,
  onReassign,
}: {
  readonly weighIn: WeighIn;
  readonly scale: Scale;
  readonly onReassign: () => void;
}): ReactNode {
  const mutation = useMutationState();
  const look = attributionLook(weighIn.attribution);
  const remove = (): void => {
    mutation.run(() => assignBodyReading(weighIn.id, null), {
      failure: 'The weigh-in was not removed',
    });
  };
  const items: readonly MenuItem[] = [
    { label: 'Reassign', icon: 'user', onPress: onReassign },
    { label: 'Don’t keep', icon: 'trash', destructive: true, onPress: remove },
  ];
  return (
    <ListRow
      title={kilograms(weighIn.kg)}
      subtitle={scale.when(weighIn.iso, false)}
      {...(weighIn.outlier ? { subtitleTone: 'warning' as const } : {})}
      trailing={
        <View className="flex-row items-center gap-1">
          {weighIn.outlier ? <Badge label="Not counted" tone="warning" /> : null}
          <Badge label={look.label} tone={look.tone} />
          <OverflowButton label={`Weigh-in ${kilograms(weighIn.kg)}`} items={items} />
        </View>
      }
    />
  );
}

export function RecentWeighIns({ scale }: { readonly scale: Scale }): ReactNode {
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const { person } = scale;
  if (person === null || person.weighIns.length < 2) {
    return null;
  }
  const recent = [...person.weighIns].reverse().slice(0, RECENT_COUNT);
  return (
    <>
      <List title="Recent weigh-ins">
        {recent.map((weighIn) => (
          <Row
            key={weighIn.id}
            weighIn={weighIn}
            scale={scale}
            onReassign={() => {
              setTarget(targetOfWeighIn(weighIn, person.profile.id));
            }}
          />
        ))}
      </List>
      {target === null ? null : (
        <AssignSheet
          queue={[target]}
          onClose={() => {
            setTarget(null);
          }}
        />
      )}
    </>
  );
}
