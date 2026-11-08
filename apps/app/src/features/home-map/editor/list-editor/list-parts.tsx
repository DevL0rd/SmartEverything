import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { HomeMapVec } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../../components/disclosure';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { useColour } from '../../../../design/colour';
import { cn } from '../../../../design/cn';
import { centimetres } from '../tools/openings-panel';

export const THUMB = { width: 96, height: 48, pad: 6 } as const;

export function thumbPath(points: readonly HomeMapVec[], closed: boolean): string {
  if (points.length === 0) return '';
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const inner = { width: THUMB.width - THUMB.pad * 2, height: THUMB.height - THUMB.pad * 2 };
  const scale = Math.min(
    spanX > 0 ? inner.width / spanX : Infinity,
    spanY > 0 ? inner.height / spanY : Infinity,
  );
  const fit = Number.isFinite(scale) ? scale : 1;
  const offX = THUMB.pad + (inner.width - spanX * fit) / 2;
  const offY = THUMB.pad + (inner.height - spanY * fit) / 2;
  const steps = points.map((point, index) => {
    const x = (offX + (point.x - minX) * fit).toFixed(1);
    const y = (offY + (point.y - minY) * fit).toFixed(1);
    return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
  });
  return `${steps.join(' ')}${closed ? ' Z' : ''}`;
}

export function ShapeThumb({
  points,
  closed,
}: {
  readonly points: readonly HomeMapVec[];
  readonly closed: boolean;
}): ReactNode {
  const stroke = useColour('primary');
  return (
    <View className="h-12 w-24 shrink-0 overflow-hidden rounded-sm bg-surface-2">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${String(THUMB.width)} ${String(THUMB.height)}`}
      >
        <Path
          d={thumbPath(points, closed)}
          stroke={stroke}
          strokeWidth={closed ? 1.5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={closed ? stroke : 'none'}
          fillOpacity={0.18}
        />
      </Svg>
    </View>
  );
}

export function ListSection({
  title,
  icon,
  count,
  addLabel,
  disabled,
  onAdd,
  children,
}: {
  readonly title: string;
  readonly icon: IconName;
  readonly count: number;
  readonly addLabel: string;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={20} tone="variant" />
        <Text variant="body-strong" accessibilityRole="header" className="min-w-0 flex-1">
          {`${title} · ${String(count)}`}
        </Text>
        <Button label={addLabel} icon="plus" variant="tonal" disabled={disabled} onPress={onAdd} />
      </View>
      {children}
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  thumb,
  open,
  onToggle,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly thumb: ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <CollapseRoot className={cn('rounded-md bg-surface-1', open && 'bg-surface-2')}>
      <Interactive
        label={`${title}, ${subtitle}`}
        expanded={open}
        onPress={onToggle}
        className="min-h-touch-min flex-row items-center gap-3 rounded-md p-2"
        layerClassName="rounded-md"
      >
        {thumb}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {subtitle}
          </Text>
        </View>
        <TurnChevron open={open} />
      </Interactive>
      {open ? <CollapseBody className="gap-3 px-2 pb-3">{children}</CollapseBody> : null}
    </CollapseRoot>
  );
}

export const UNBOUNDED_CM = Number.MAX_SAFE_INTEGER;

export function CmField({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly disabled: boolean;
  readonly onChange: (metres: number) => void;
}): ReactNode {
  return (
    <NumberStepper
      label={label}
      unit="cm"
      step={1}
      value={centimetres(value)}
      min={min === -Infinity ? -UNBOUNDED_CM : centimetres(min)}
      max={UNBOUNDED_CM}
      disabled={disabled}
      onChange={(cm): void => {
        onChange(cm / 100);
      }}
    />
  );
}

export function PointFields({
  label,
  point,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly point: HomeMapVec;
  readonly disabled: boolean;
  readonly onChange: (point: HomeMapVec) => void;
}): ReactNode {
  return (
    <View accessibilityLabel={label} className="gap-1">
      <Text variant="caption" tone="variant">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <View className="min-w-40 flex-1">
          <CmField
            label={`${label} across`}
            value={point.x}
            min={-Infinity}
            disabled={disabled}
            onChange={(x): void => {
              onChange({ x, y: point.y });
            }}
          />
        </View>
        <View className="min-w-40 flex-1">
          <CmField
            label={`${label} down`}
            value={point.y}
            min={-Infinity}
            disabled={disabled}
            onChange={(y): void => {
              onChange({ x: point.x, y });
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function metres(value: number): string {
  return `${value.toFixed(2)} m`;
}
