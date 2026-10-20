import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { useColour } from '../../../../design/colour';
import { RING, SPIN, loopStyle } from '../../../../design/loops';
import type { TreadmillFacts } from '../../types';
import { Part, Plane } from './frame';
import { rotateAbout, type Point } from './geometry';
import type { Silver } from './palette';
import { Label, Slab } from './shapes';

const HALO = { x: -30, y: -30, w: 60, h: 60 } as const;

interface NoticeProps {
  readonly px: number;
  readonly facts: TreadmillFacts;
  readonly silver: Silver;
  readonly centre: Point;
  readonly running: boolean;
}

function Countdown({ px, facts, centre }: NoticeProps): ReactNode {
  const caution = useColour('caution');
  if (facts.belt !== 'countdown') {
    return null;
  }
  return (
    <Plane px={px}>
      <Circle
        cx={centre.x}
        cy={centre.y}
        r={26}
        fill="none"
        stroke={caution}
        strokeWidth={3}
        strokeDasharray="9 7"
      />
    </Plane>
  );
}

function Linking({ px, facts, centre, running }: NoticeProps): ReactNode {
  const primary = useColour('primary');
  if (facts.link === 'searching') {
    const motion = loopStyle({ name: RING, ms: 1600 }, running);
    return (
      <Part
        px={px}
        at={centre}
        box={HALO}
        motion={motion}
        shape={<Circle r={22} fill="none" stroke={primary} strokeWidth={2} />}
      />
    );
  }
  if (facts.link === 'connecting') {
    const motion = loopStyle({ name: SPIN, ms: 1400 }, running);
    return (
      <Part
        px={px}
        at={centre}
        box={HALO}
        motion={motion}
        shape={
          <Path
            d="M-24 0A24 24 0 0 1 0 -24"
            fill="none"
            stroke={primary}
            strokeWidth={3}
            strokeLinecap="round"
          />
        }
      />
    );
  }
  return null;
}

function Busy({ px, facts, silver, centre }: NoticeProps): ReactNode {
  if (facts.link !== 'busy') {
    return null;
  }
  return (
    <Plane px={px}>
      <Slab x={centre.x - 32} y={centre.y - 52} w={64} h={24} r={12} fill={silver.sv5} />
      <Label
        x={centre.x}
        y={centre.y - 35.5}
        fill={silver.sv1}
        fontSize={14}
        fontWeight="700"
        textAnchor="middle"
        text="KS Fit"
      />
    </Plane>
  );
}

function FaultPlate({ px, facts, silver }: NoticeProps): ReactNode {
  const warning = useColour('warning');
  return (
    <Plane px={px}>
      <Slab
        x={62}
        y={150}
        w={170}
        h={92}
        r={14}
        fill={warning}
        stroke={silver.sv5}
        strokeWidth={1}
      />
      <Path d="M82 214l15-30 15 30z" fill={silver.sv5} />
      <Label
        x={97}
        y={211}
        fill={warning}
        fontSize={14}
        fontWeight="700"
        textAnchor="middle"
        text="!"
      />
      <Label
        x={128}
        y={200}
        fill={silver.sv5}
        fontSize={22}
        fontWeight="700"
        text={facts.fault ?? ''}
      />
      <Label x={128} y={224} fill={silver.sv5} fontSize={14} text="Fault code" />
    </Plane>
  );
}

function SafetyPlate({ px, silver }: NoticeProps): ReactNode {
  const critical = useColour('critical');
  return (
    <Plane px={px}>
      <Slab x={196} y={44} w={176} h={30} r={15} fill={critical} />
      <Label
        x={284}
        y={64}
        fill={silver.sv1}
        fontSize={14}
        fontWeight="700"
        textAnchor="middle"
        text="Safety key pulled"
      />
    </Plane>
  );
}

function Plates(props: NoticeProps): ReactNode {
  if (props.facts.belt === 'fault') {
    return <FaultPlate {...props} />;
  }
  return props.facts.belt === 'safety_stop' ? <SafetyPlate {...props} /> : null;
}

function Lock({ px, facts, silver, centre }: NoticeProps): ReactNode {
  const ink = useColour('on-surface');
  if (!facts.childLock) {
    return null;
  }
  const x = centre.x + 26;
  const y = centre.y - 44;
  const d = `M${String(x + 7.5)} ${String(y + 11)}V${String(y + 8.6)}a4.5 4.5 0 0 1 9 0V${String(y + 11)}M${String(x + 6.5)} ${String(y + 11)}h11v8h-11z`;
  return (
    <Plane px={px}>
      <Slab x={x} y={y} w={24} h={24} r={12} fill={silver.sv5} />
      <Path d={d} stroke={ink} strokeWidth={1.4} fill="none" />
    </Plane>
  );
}

function Lost({ px, facts }: NoticeProps): ReactNode {
  const variant = useColour('on-surface-variant');
  if (facts.link !== 'lost' && facts.link !== 'not_linked') {
    return null;
  }
  return (
    <Plane px={px}>
      <Slab
        x={14}
        y={92}
        w={372}
        h={272}
        r={18}
        fill="none"
        stroke={variant}
        strokeWidth={1.4}
        strokeDasharray="5 5"
      />
    </Plane>
  );
}

export function Notices({
  px,
  facts,
  silver,
  tilt,
  live,
}: Pick<NoticeProps, 'px' | 'facts' | 'silver'> & {
  readonly tilt: number;
  readonly live: boolean;
}): ReactNode {
  const centre = rotateAbout({ x: 318, y: 108 }, tilt);
  const props = { px, facts, silver, centre, running: live };
  return (
    <>
      <Countdown {...props} />
      <Linking {...props} />
      <Busy {...props} />
      <Plates {...props} />
      <Lock {...props} />
      <Lost {...props} />
    </>
  );
}
