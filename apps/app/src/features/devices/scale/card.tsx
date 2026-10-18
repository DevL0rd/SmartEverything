import { useState, type ReactNode } from 'react';
import { Text } from '../../../components/text';
import { GenericCardFace } from '../card/generic-card-face';
import type { CardFaceProps } from '../card/card-face';
import { WideCard, isWideClass, type WideClass } from '../card/wide-card';
import { AssignSheet } from './assign-sheet';
import { targetsFor } from './assign-model';
import { scaleLine, scaleSummary, type ScaleAction } from './card-model';
import { actionsOf, figuresOf, Graph, Stage, tickerOf } from './card-parts';
import { PersonChip } from './person-chip';
import { useScale, type Scale } from './use-scale';

function WideScale({ scale, cls }: { readonly scale: Scale; readonly cls: WideClass }): ReactNode {
  const [open, setOpen] = useState<ScaleAction['kind'] | null>(null);
  const { facts, device, people, person, pending } = scale;
  const line = scaleLine(facts, scale.when);
  return (
    <>
      <WideCard
        cls={cls}
        summary={scaleSummary(device.label, facts, line.text, pending.length)}
        visual={<Stage scale={scale} cls={cls} />}
        title={device.label}
        chip={<PersonChip deviceId={device.id} people={people} person={person} />}
        state={
          <Text variant="footnote" tone={line.tone} numberOfLines={cls === 'm' ? 1 : 2}>
            {line.text}
          </Text>
        }
        figures={figuresOf({ scale, cls })}
        graph={<Graph scale={scale} cls={cls} />}
        actions={actionsOf({ scale, onOpen: setOpen })}
        ticker={tickerOf({ scale })}
      />
      {open === null ? null : (
        <AssignSheet
          queue={targetsFor(open, facts.latest, person?.profile.id ?? null, pending)}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

export function ScaleCard(props: CardFaceProps): ReactNode {
  const { cls } = props;
  if (!isWideClass(cls)) {
    return <GenericCardFace {...props} />;
  }
  return <WideScaleHost device={props.device} cls={cls} />;
}

function WideScaleHost({
  device,
  cls,
}: {
  readonly device: CardFaceProps['device'];
  readonly cls: WideClass;
}): ReactNode {
  return <WideScale scale={useScale(device)} cls={cls} />;
}
