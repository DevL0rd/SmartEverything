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

const NARROW_BELOW = 280;

function pickerOf(scale: Scale, narrow: boolean): ReactNode[] {
  const { device, people, person } = scale;
  return person === null || people.length < 2
    ? []
    : [
        <PersonChip
          key="person"
          deviceId={device.id}
          people={people}
          person={person}
          compact={narrow}
        />,
      ];
}

function WideScale({
  scale,
  cls,
  frame,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
  readonly frame: CardFaceProps['frame'];
}): ReactNode {
  const [open, setOpen] = useState<ScaleAction['kind'] | null>(null);
  const { facts, device, person, pending } = scale;
  const line = scaleLine(facts, scale.when);
  const narrow = cls === 'm' && frame.width < NARROW_BELOW;
  return (
    <>
      <WideCard
        cls={cls}
        summary={scaleSummary(device.label, facts, line.text, pending.length)}
        visual={<Stage scale={scale} cls={cls} />}
        title={device.label}
        titleLines={cls === 'm' ? 2 : 1}
        state={
          <Text variant="footnote" tone={line.tone} numberOfLines={cls === 'm' ? 1 : 2}>
            {line.text}
          </Text>
        }
        figures={figuresOf({ scale, cls })}
        graph={<Graph scale={scale} cls={cls} />}
        actions={[...pickerOf(scale, narrow), ...actionsOf({ scale, onOpen: setOpen, narrow })]}
        ticker={cls === 'm' && pending.length > 0 ? undefined : tickerOf({ scale })}
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
  return <WideScaleHost device={props.device} cls={cls} frame={props.frame} />;
}

function WideScaleHost({
  device,
  cls,
  frame,
}: {
  readonly device: CardFaceProps['device'];
  readonly cls: WideClass;
  readonly frame: CardFaceProps['frame'];
}): ReactNode {
  return <WideScale scale={useScale(device)} cls={cls} frame={frame} />;
}
