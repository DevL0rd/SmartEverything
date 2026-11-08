import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapObject } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { useIdiom } from '../../../../design/platform';
import { useSelectionSurface } from '../docked-panel';
import { useSelectionActions } from '../manipulate/selection-actions';
import type { Manipulation } from '../manipulate/use-manipulation';
import type { FurnitureTool } from '../tools/furniture';
import {
  CUSTOM_HINT,
  CUSTOM_PRESET,
  SCALE,
  SHOWN_UNIT,
  STEP,
  activePreset,
  objectEditFacts,
  paramPatch,
  paramValue,
  presetPatch,
  resetLabel,
  resetPatch,
  type ObjectEditFacts,
  type ObjectEditFinish,
  type ObjectEditParam,
} from './object-edit-model';
import { ActionList, InspectorHead, TransformFields } from './object-inspector';

interface SectionProps {
  readonly object: HomeMapObject;
  readonly facts: ObjectEditFacts;
  readonly off: boolean;
  readonly onPatch: (patch: Partial<HomeMapObject>) => void;
}

function Heading({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {text}
    </Text>
  );
}

function ParamStepper({
  param,
  ...props
}: SectionProps & { readonly param: ObjectEditParam }): ReactNode {
  const scale = SCALE[param.unit];
  const unit = SHOWN_UNIT[param.unit];
  return (
    <NumberStepper
      label={param.label}
      value={Math.round(paramValue(props.object, param) * scale)}
      min={Math.ceil(param.min * scale)}
      max={Math.floor(param.max * scale)}
      step={STEP[param.unit]}
      {...(unit === '' ? {} : { unit })}
      disabled={props.off}
      onChange={(shown): void => {
        props.onPatch(paramPatch(props.object, props.facts, param.name, shown / scale));
      }}
    />
  );
}

function Chip({
  label,
  selected,
  off,
  onPick,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly off: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={label}
      selected={selected}
      disabled={off}
      onPress={(): void => {
        if (!selected) onPick();
      }}
      className={cn(
        'min-h-touch-min justify-center rounded-full px-3',
        selected ? 'bg-primary-container' : 'bg-surface-3',
      )}
    >
      <Text variant="footnote">{label}</Text>
    </Interactive>
  );
}

function Presets(props: SectionProps): ReactNode {
  const { facts, object, off, onPatch } = props;
  if (facts.presets.length === 0) return null;
  const active = activePreset(object, facts);
  return (
    <View className="gap-1.5">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Size"
        className="flex-row flex-wrap gap-1.5"
      >
        {facts.presets.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={active === preset.id}
            off={off}
            onPick={(): void => {
              onPatch(presetPatch(object, facts, preset));
            }}
          />
        ))}
        <View
          accessibilityRole="text"
          accessibilityState={{ selected: active === CUSTOM_PRESET }}
          className={cn(
            'min-h-touch-min justify-center rounded-full px-3',
            active === CUSTOM_PRESET ? 'bg-primary-container' : 'bg-surface-3',
          )}
        >
          <Text variant="footnote">Custom</Text>
        </View>
      </View>
      {active === CUSTOM_PRESET ? (
        <Text variant="caption" tone="variant">
          {CUSTOM_HINT}
        </Text>
      ) : null}
    </View>
  );
}

function SizeSection(props: SectionProps): ReactNode {
  if (props.facts.presets.length === 0) return null;
  return (
    <View className="gap-2">
      <Heading text="Size" />
      <Presets {...props} />
    </View>
  );
}

function PartsSection(props: SectionProps): ReactNode {
  if (props.facts.parts.length === 0) return null;
  return (
    <View className="gap-2">
      <Heading text="Parts" />
      {props.facts.parts.map((param) => (
        <ParamStepper key={param.name} param={param} {...props} />
      ))}
    </View>
  );
}

function StyleSection({ object, facts, off, onPatch }: SectionProps): ReactNode {
  if (facts.styles.length === 0) return null;
  const current = object.style ?? facts.defaultStyle;
  return (
    <View className="gap-1.5">
      <Heading text="Style" />
      <View accessibilityRole="radiogroup" accessibilityLabel="Style" className="flex-row gap-2">
        {facts.styles.map((style) => (
          <Interactive
            key={style.name}
            role="radio"
            label={style.label}
            selected={current === style.name}
            disabled={off}
            onPress={(): void => {
              if (current !== style.name) onPatch({ style: style.name });
            }}
            className={cn(
              'min-h-touch-min flex-1 items-center justify-center rounded-md border-2 p-2',
              current === style.name
                ? 'border-primary bg-primary-container'
                : 'border-transparent bg-surface-3',
            )}
          >
            <Text variant="footnote" numberOfLines={1}>
              {style.label}
            </Text>
          </Interactive>
        ))}
      </View>
    </View>
  );
}

function Swatch({
  finish,
  selected,
  off,
  onPick,
}: {
  readonly finish: ObjectEditFinish;
  readonly selected: boolean;
  readonly off: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={finish.label}
      selected={selected}
      disabled={off}
      onPress={(): void => {
        if (!selected) onPick();
      }}
      className="min-h-touch-min min-w-touch-min items-center gap-1"
    >
      <View
        className={cn(
          'size-touch-min rounded-full border-2 p-0.5',
          selected ? 'border-primary' : 'border-transparent',
        )}
      >
        <View
          className="h-full w-full rounded-full border border-outline-variant bg-surface-3"
          style={finish.colour === null ? undefined : { backgroundColor: finish.colour }}
        />
      </View>
      <Text variant="caption" tone={selected ? 'default' : 'variant'} numberOfLines={1}>
        {finish.label}
      </Text>
    </Interactive>
  );
}

function ColourSection({ object, facts, off, onPatch }: SectionProps): ReactNode {
  if (facts.finishes.length === 0) return null;
  const current = object.finish ?? facts.defaultFinish;
  return (
    <View className="gap-1.5">
      <Heading text="Colour" />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Colour"
        className="flex-row flex-wrap gap-2"
      >
        {facts.finishes.map((finish) => (
          <Swatch
            key={finish.name}
            finish={finish}
            selected={current === finish.name}
            off={off}
            onPick={(): void => {
              onPatch({ finish: finish.name });
            }}
          />
        ))}
      </View>
    </View>
  );
}

function LookSections(props: SectionProps): ReactNode {
  return (
    <>
      <StyleSection {...props} />
      <ColourSection {...props} />
      <Button
        label={resetLabel(props.facts)}
        icon="refresh"
        variant="tonal"
        disabled={props.off}
        onPress={(): void => {
          props.onPatch(resetPatch(props.facts));
        }}
      />
    </>
  );
}

export interface ObjectEditProps {
  readonly tool: FurnitureTool;
  readonly object: HomeMapObject;
  readonly manipulation: Manipulation;
}

export function ObjectEdit({ tool, object, manipulation }: ObjectEditProps): ReactNode {
  const side = useSelectionSurface() === 'menu';
  const keys = useIdiom() === 'pointer';
  const actions = useSelectionActions(tool);
  const spec = tool.specOf(object.modelId);
  if (spec === undefined) return null;
  const section: SectionProps = {
    object,
    facts: objectEditFacts(spec),
    off: tool.readOnly || object.locked,
    onPatch: (patch): void => {
      tool.patch(object.id, patch);
    },
  };
  const looks = <LookSections {...section} />;
  return (
    <View accessibilityLabel="Position, size, style and colour" className="gap-3">
      {side ? (
        <InspectorHead
          manipulation={manipulation}
          readOnly={tool.readOnly}
          onUnlock={(): void => {
            actions?.onAction('lock');
          }}
        />
      ) : null}
      <TransformFields {...section} spec={spec} mode={manipulation.gizmo.mode} />
      <SizeSection {...section} />
      <PartsSection {...section} />
      {side && actions !== null ? (
        <ActionList actions={actions} locked={object.locked} keys={keys} looks={looks} />
      ) : (
        looks
      )}
    </View>
  );
}
