import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { formatLaundryMinutes, type LaundryProgram } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SearchField } from '../../../components/search-field';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { EdgeFades, useEdges, type Ground } from './edge-fades';
import { Note, FieldLabel } from './parts';
import { PROGRAM_ICON } from './program-icons';
import {
  chipPrograms,
  dialOf,
  morePrograms,
  programSections,
  selectedIndex,
  type ProgramSection,
} from './programs';
import { useReveal } from './use-reveal';
import type { DraftHandle } from './use-draft';
import type { Laundry } from './use-laundry';

const MAY_REFUSE = 'May be refused';

const NOT_ON_DIAL =
  'Not on your machine’s dial. We will send it anyway; the machine may refuse it.';

function Chip({
  program,
  selected,
  sub,
  disabled,
  onPick,
  onLayout,
}: {
  readonly program: LaundryProgram;
  readonly selected: boolean;
  readonly sub: string | null;
  readonly disabled: boolean;
  readonly onPick: (program: LaundryProgram) => void;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}): ReactNode {
  return (
    <View onLayout={onLayout}>
      <Interactive
        role="radio"
        checked={selected}
        disabled={disabled}
        label={sub === null ? program.label : `${program.label}, ${sub}`}
        onPress={() => {
          onPick(program);
        }}
        className={cn(
          'min-h-touch-min max-w-44 flex-row items-center gap-2 rounded-full border py-1 pl-2.5 pr-3.5',
          selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-2',
        )}
        layerClassName="rounded-full"
      >
        <Icon name={PROGRAM_ICON[program.icon]} size={20} tone={selected ? 'default' : 'variant'} />
        <View className="min-w-0 shrink">
          <Text variant="label" numberOfLines={2}>
            {program.label}
          </Text>
          {sub === null ? null : (
            <Text variant="caption" tone="variant" className="tabular">
              {sub}
            </Text>
          )}
        </View>
      </Interactive>
    </View>
  );
}

function tracked(
  key: number,
  track: (key: number, start: number, size: number) => void,
): (event: LayoutChangeEvent) => void {
  return (event): void => {
    const { x, width } = event.nativeEvent.layout;
    track(key, x, width);
  };
}

function ChipRow({
  programs,
  selectedId,
  subOf,
  disabled,
  ground,
  onPick,
}: {
  readonly programs: readonly LaundryProgram[];
  readonly selectedId: number | undefined;
  readonly subOf: (program: LaundryProgram) => string | null;
  readonly disabled: boolean;
  readonly ground: Ground;
  readonly onPick: (program: LaundryProgram) => void;
}): ReactNode {
  const { attach, viewport, track } = useReveal('x', selectedId, programs.length);
  const edges = useEdges();
  return (
    <View className="relative">
      <ScrollView
        ref={attach}
        horizontal
        showsHorizontalScrollIndicator={false}
        {...edges.scroll}
        onLayout={(event) => {
          viewport(event.nativeEvent.layout.width);
          edges.onViewport(event.nativeEvent.layout.width);
        }}
        contentContainerClassName="gap-2 py-0.5"
        accessibilityRole="radiogroup"
        accessibilityLabel="Programs on your machine"
      >
        {programs.map((program) => (
          <Chip
            key={program.id}
            program={program}
            selected={program.id === selectedId}
            sub={subOf(program)}
            disabled={disabled}
            onPick={onPick}
            onLayout={tracked(program.id, track)}
          />
        ))}
      </ScrollView>
      <EdgeFades start={edges.start} end={edges.end} ground={ground} />
    </View>
  );
}

function SheetSections({
  sections,
  selected,
  disabled,
  onPick,
}: {
  readonly sections: readonly ProgramSection[];
  readonly disabled: boolean;
  readonly selected: LaundryProgram | undefined;
  readonly onPick: (program: LaundryProgram) => void;
}): ReactNode {
  const target = sections[selectedIndex(sections, selected)];
  const { attach, track } = useReveal('y', target?.key, sections.length);
  return (
    <ScrollView ref={attach} contentContainerClassName="gap-4 pb-6" className="min-h-0 flex-1">
      {sections.map((section) => (
        <View
          key={section.key}
          accessibilityRole="radiogroup"
          accessibilityLabel={section.title}
          className="gap-2"
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            track(section.key, y, height);
          }}
        >
          <FieldLabel text={`${section.title} (${String(section.programs.length)})`} />
          <View className="flex-row flex-wrap gap-2">
            {section.programs.map((program) => (
              <Chip
                key={program.id}
                program={program}
                selected={program.id === selected?.id}
                sub={section.key === 'dial' ? null : MAY_REFUSE}
                disabled={disabled}
                onPick={onPick}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ProgramSheet({
  dial,
  selected,
  disabled,
  onPick,
  onClose,
}: {
  readonly dial: readonly LaundryProgram[];
  readonly selected: LaundryProgram | undefined;
  readonly disabled: boolean;
  readonly onPick: (program: LaundryProgram) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  return (
    <Sheet open title="All programs" detents={['full']} scroll={false} onClose={onClose}>
      <View className="gap-3 px-1 pb-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search programs"
          variant="field"
        />
        <Text variant="footnote" tone="variant">
          {`${String(dial.length)} are on your machine. The other ${String(morePrograms(dial).length)} are sent anyway; if the machine refuses one, we say so.`}
        </Text>
      </View>
      <SheetSections
        sections={programSections(dial, query)}
        selected={selected}
        disabled={disabled}
        onPick={(entry) => {
          onPick(entry);
          onClose();
        }}
      />
    </Sheet>
  );
}

function MoreLink({
  count,
  onPress,
}: {
  readonly count: number;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`More programs, ${String(count)}`}
      onPress={onPress}
      className="min-h-touch-min justify-center self-start"
    >
      <Text variant="body-strong" className="underline">
        {`More programs (${String(count)}) ›`}
      </Text>
    </Interactive>
  );
}

function subOf(
  program: LaundryProgram,
  selected: LaundryProgram | undefined,
  draft: DraftHandle,
  off: boolean,
): string | null {
  if (program.id !== selected?.id) {
    return null;
  }
  if (draft.picking) {
    return 'Setting…';
  }
  if (off) {
    return MAY_REFUSE;
  }
  return draft.estimate === null ? null : formatLaundryMinutes(draft.estimate);
}

function More({
  dial,
  selected,
  draft,
}: {
  readonly dial: readonly LaundryProgram[];
  readonly selected: LaundryProgram | undefined;
  readonly draft: DraftHandle;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (dial.length === 0) {
    return null;
  }
  return (
    <>
      <MoreLink
        count={morePrograms(dial).length}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <ProgramSheet
          dial={dial}
          selected={selected}
          disabled={draft.locked}
          onPick={draft.pick}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function ProgramPicker({
  laundry,
  draft,
  ground = 'surface-1',
}: {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
  readonly ground?: Ground;
}): ReactNode {
  const dial = dialOf(laundry.snapshot.values.laundry_dial);
  const known = dial.length > 0;
  const selected = draft.program;
  const off = known && selected !== undefined && !dial.some((entry) => entry.id === selected.id);
  return (
    <View className="gap-3">
      <FieldLabel text={known ? 'On your machine' : 'Programs'} />
      <ChipRow
        programs={chipPrograms(known ? dial : morePrograms([]), selected)}
        selectedId={selected?.id}
        subOf={(program) => subOf(program, selected, draft, off)}
        disabled={draft.locked}
        ground={ground}
        onPick={draft.pick}
      />
      {draft.pickFailure === null ? null : (
        <Note icon="alert" tone="critical" text={draft.pickFailure} />
      )}
      <More dial={dial} selected={selected} draft={draft} />
      {off ? <Note text={NOT_ON_DIAL} /> : null}
    </View>
  );
}
