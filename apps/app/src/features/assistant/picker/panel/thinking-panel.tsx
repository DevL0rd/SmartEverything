import type { ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import { useFocusRequest } from '../../../../components/focus-request';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { Segmented } from '../../../../components/segmented';
import { List } from '../../../../components/section';
import { useKeyboardRow } from '../../../../components/keyboard-list';
import { Text } from '../../../../components/text';
import { useKeyboard } from '../../../../app-shell/shortcuts';
import {
  appliedEffort,
  cycleEffort,
  effortOverride,
  effortText,
  useEngineThinking,
  type EngineThinking,
} from '../../chats/engine-efforts';
import { KeyedRow, PanelHead, PanelSection } from './panel-chrome';

const NARROW_BELOW = 380;
const LARGE_TEXT_ABOVE = 1.3;
const SEGMENTS_MAX = 5;

interface ThinkingProps {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
}

export interface ThinkingLevel {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export function levelsOf(thinking: EngineThinking): readonly ThinkingLevel[] {
  return thinking.efforts.map((effort) => ({
    value: effort.id,
    label: effort.name,
    ...(effort.description === null ? {} : { description: effort.description }),
  }));
}

export function selectedLevel(engine: Engine, thinking: EngineThinking): string | null {
  return appliedEffort(thinking, engine.effort);
}

export function currentLabel(engine: Engine, thinking: EngineThinking): string | null {
  return effortText(thinking, engine.effort);
}

export function fitsSegments(thinking: EngineThinking): boolean {
  const levels = levelsOf(thinking);
  return levels.length <= SEGMENTS_MAX && levels.every((level) => level.description === undefined);
}

function effortIds(thinking: EngineThinking): readonly string[] {
  return thinking.efforts.map((effort) => effort.id);
}

const THINKING_ROW = 'thinking';

function valueOf(label: string | null): { readonly value?: string } {
  return label === null ? {} : { value: label };
}

const ARROWS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowLeft: -1 };

function ArrowKeys({
  blocked,
  step,
}: {
  readonly blocked: boolean;
  readonly step: (direction: 1 | -1) => void;
}): null {
  const { highlighted } = useKeyboardRow(THINKING_ROW);
  useKeyboard((press): boolean => {
    const direction = ARROWS[press.key];
    if (!highlighted || blocked || direction === undefined) return false;
    step(direction);
    return true;
  });
  return null;
}

function SegmentedThinking({ engine, onChange, blocked }: ThinkingProps): ReactNode {
  const thinking = useEngineThinking(engine);
  const current = selectedLevel(engine, thinking);
  const select = (level: string | null): void => {
    onChange({ ...engine, effort: effortOverride(thinking, level) });
  };
  return (
    <>
      <ArrowKeys
        blocked={blocked}
        step={(direction): void => {
          const next = cycleEffort(effortIds(thinking), current, direction, false);
          if (next !== current) select(next);
        }}
      />
      <PanelSection title="Thinking">
        <Segmented
          fill
          label="Thinking level"
          value={current ?? ''}
          disabled={blocked}
          options={levelsOf(thinking)}
          onChange={(value): void => {
            select(value);
          }}
        />
      </PanelSection>
    </>
  );
}

export function ThinkingRow({
  engine,
  onChange,
  blocked,
  onOpen,
  restoreFocus = false,
}: ThinkingProps & { readonly onOpen: () => void; readonly restoreFocus?: boolean }): ReactNode {
  const thinking = useEngineThinking(engine);
  const { width } = usePanelFrame();
  const ref = useFocusRequest(restoreFocus && !blocked);
  if (thinking.efforts.length === 0) {
    return (
      <View className="py-2">
        <Text variant="footnote" tone="variant">
          No thinking levels for this model
        </Text>
      </View>
    );
  }
  const asPage =
    width < NARROW_BELOW || !fitsSegments(thinking) || PixelRatio.getFontScale() > LARGE_TEXT_ABOVE;
  return (
    <KeyedRow id={THINKING_ROW} className="rounded-sm">
      {asPage ? (
        <ListRow
          pressRef={ref}
          compact
          title="Thinking"
          {...valueOf(currentLabel(engine, thinking))}
          chevron
          disabled={blocked}
          onPress={onOpen}
        />
      ) : (
        <View ref={ref}>
          <SegmentedThinking engine={engine} onChange={onChange} blocked={blocked} />
        </View>
      )}
    </KeyedRow>
  );
}

export function ThinkingPage({
  engine,
  onChange,
  blocked,
  onBack,
  onClose,
}: ThinkingProps & { readonly onBack: () => void; readonly onClose: () => void }): ReactNode {
  const thinking = useEngineThinking(engine);
  const current = selectedLevel(engine, thinking);
  return (
    <>
      <PanelHead title="Thinking" onBack={onBack} onClose={onClose} />
      <List>
        {levelsOf(thinking).map((level) => {
          const selected = current === level.value;
          return (
            <ListRow
              key={level.value}
              title={level.label}
              {...(level.description === undefined ? {} : { subtitle: level.description })}
              disabled={blocked}
              selected={selected}
              trailing={selected ? <Icon name="check" size={20} tone="primary" /> : undefined}
              onPress={(): void => {
                onChange({ ...engine, effort: effortOverride(thinking, level.value) });
                onBack();
              }}
            />
          );
        })}
      </List>
    </>
  );
}
