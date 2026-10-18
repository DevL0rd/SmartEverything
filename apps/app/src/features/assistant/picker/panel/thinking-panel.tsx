import type { ReactNode } from 'react';
import { PixelRatio, ScrollView, View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { Segmented } from '../../../../components/segmented';
import { List } from '../../../../components/section';
import { useKeyboardRow } from '../../../../components/keyboard-list';
import { Text } from '../../../../components/text';
import { useKeyboard } from '../../../../app-shell/shortcuts';
import { cycleEffort, useEngineEfforts } from '../../chats/engine-efforts';
import { isComputerEngine } from '../../provider/computer-engine';
import { effortLabel } from '../efforts';
import { KeyedRow, PanelHead } from './panel-chrome';

const NARROW_BELOW = 380;
const LARGE_TEXT_ABOVE = 1.3;
const SEGMENTS_MAX = 5;

interface ThinkingProps {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
}

function levelsOf(
  engine: Engine,
  efforts: readonly string[],
): readonly { value: string; label: string }[] {
  return [
    { value: '', label: isComputerEngine(engine) ? 'Runtime default' : 'Default' },
    ...efforts.map((value) => ({ value, label: effortLabel(value) })),
  ];
}

function currentLabel(engine: Engine): string {
  if (engine.effort !== null) return effortLabel(engine.effort);
  return isComputerEngine(engine) ? 'Runtime default' : 'Default';
}

const THINKING_ROW = 'thinking';

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
  const efforts = useEngineEfforts(engine);
  const select = (effort: string | null): void => {
    onChange({ ...engine, effort });
  };
  return (
    <>
      <ArrowKeys
        blocked={blocked}
        step={(direction): void => {
          select(cycleEffort(efforts, engine.effort, direction, false));
        }}
      />
      <View className="min-h-11 flex-row items-center gap-3 px-4 pb-2">
        <Text variant="label">Thinking</Text>
        <View className="min-w-0 flex-1">
          <Segmented
            label="Thinking level"
            value={engine.effort ?? ''}
            disabled={blocked}
            options={levelsOf(engine, efforts)}
            onChange={(value): void => {
              select(value === '' ? null : value);
            }}
          />
        </View>
      </View>
    </>
  );
}

export function ThinkingRow({
  engine,
  onChange,
  blocked,
  onOpen,
}: ThinkingProps & { readonly onOpen: () => void }): ReactNode {
  const efforts = useEngineEfforts(engine);
  const { width } = usePanelFrame();
  if (efforts.length === 0) {
    return (
      <View className="min-h-11 justify-center px-4">
        <Text variant="footnote" tone="faint">
          No thinking levels for this model
        </Text>
      </View>
    );
  }
  const asPage =
    width < NARROW_BELOW ||
    levelsOf(engine, efforts).length > SEGMENTS_MAX ||
    PixelRatio.getFontScale() > LARGE_TEXT_ABOVE;
  return (
    <KeyedRow id={THINKING_ROW}>
      {asPage ? (
        <ListRow
          title="Thinking"
          value={currentLabel(engine)}
          chevron
          disabled={blocked}
          onPress={onOpen}
        />
      ) : (
        <SegmentedThinking engine={engine} onChange={onChange} blocked={blocked} />
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
  const efforts = useEngineEfforts(engine);
  return (
    <>
      <PanelHead title="Thinking" onBack={onBack} onClose={onClose} />
      <ScrollView className="min-h-0 flex-1">
        <List>
          {levelsOf(engine, efforts).map((level) => {
            const selected = (engine.effort ?? '') === level.value;
            return (
              <ListRow
                key={level.value}
                title={level.label}
                disabled={blocked}
                selected={selected}
                trailing={selected ? <Icon name="check" size={20} tone="primary" /> : undefined}
                onPress={(): void => {
                  onChange({ ...engine, effort: level.value === '' ? null : level.value });
                  onBack();
                }}
              />
            );
          })}
        </List>
      </ScrollView>
    </>
  );
}
