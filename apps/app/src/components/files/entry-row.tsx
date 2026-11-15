import type { ReactNode } from 'react';
import { View } from 'react-native';
import { bytes } from '../../format/number';
import { shortDate } from '../../format/time';
import { Highlighted, type TextRange } from '../highlighted';
import { Icon, type IconName } from '../icon';
import { Interactive, type Point } from '../interactive';
import { OverflowButton, type MenuItem, type MenuOptions } from '../menu';
import { Text } from '../text';
import type { Tone } from '../tone';
import { FileGlyph } from './file-glyph';
import type { EntryKind } from './file-kind';

export interface EntryMark {
  readonly key: string;
  readonly icon: IconName;
  readonly tone: Tone;
  readonly label: string;
}

export interface EntryRowProps {
  readonly name: string;
  readonly kind: EntryKind;
  readonly caption: string | null;
  readonly detail?: ReactNode;
  readonly size: number | null;
  readonly modifiedAt: string | null;
  readonly wide: boolean;
  readonly selecting: boolean;
  readonly selected: boolean;
  readonly openLabel: string;
  readonly menu: readonly MenuItem[];
  readonly menuOptions?: MenuOptions;
  readonly thumbnail?: ReactNode;
  readonly marks?: readonly EntryMark[];
  readonly by?: string | null;
  readonly nameHighlight?: TextRange | null;
  readonly below?: ReactNode;
  readonly trailing?: ReactNode;
  readonly onContextMenu?: ((point: Point) => void) | undefined;
  readonly onOpen: () => void;
  readonly onSelect: () => void;
}

const NO_MARKS: readonly EntryMark[] = [];

type LeadingProps = Pick<EntryRowProps, 'kind' | 'name' | 'selecting' | 'selected' | 'thumbnail'>;

function LeadingMark({ kind, name, selecting, selected, thumbnail }: LeadingProps): ReactNode {
  if (selecting) {
    return (
      <Icon
        name={selected ? 'circleCheck' : 'circle'}
        size={20}
        tone={selected ? 'primary' : 'faint'}
      />
    );
  }
  return thumbnail ?? <FileGlyph kind={kind} name={name} />;
}

function Leading(props: LeadingProps): ReactNode {
  return (
    <View className="w-8 items-center justify-center">
      <LeadingMark {...props} />
    </View>
  );
}

function Marks({ marks }: { readonly marks: readonly EntryMark[] }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={marks.map((mark) => mark.label).join(', ')}
      className="flex-row items-center gap-1"
    >
      {marks.map((mark) => (
        <Icon key={mark.key} name={mark.icon} size={16} tone={mark.tone} />
      ))}
    </View>
  );
}

function Title({
  name,
  caption,
  marks,
  highlight,
  below,
  detail,
}: {
  readonly name: string;
  readonly caption: string | null;
  readonly marks: readonly EntryMark[];
  readonly highlight: TextRange | null;
  readonly below: ReactNode;
  readonly detail: ReactNode;
}): ReactNode {
  const marked = marks.length > 0;
  const title = (
    <Text variant="callout" numberOfLines={1} {...(marked ? { className: 'min-w-0 shrink' } : {})}>
      <Highlighted text={name} range={highlight} />
    </Text>
  );
  return (
    <View className="min-w-0 flex-1">
      {marked ? (
        <View className="flex-row items-center gap-1.5">
          {title}
          <Marks marks={marks} />
        </View>
      ) : (
        title
      )}
      {below ??
        (caption === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {caption}
          </Text>
        ))}
      {detail}
    </View>
  );
}

function Columns({
  size,
  modifiedAt,
  by,
}: Pick<EntryRowProps, 'size' | 'modifiedAt' | 'by'>): ReactNode {
  return (
    <>
      {by === undefined ? null : (
        <Text variant="callout" tone="variant" numberOfLines={1} className="w-28">
          {by ?? '—'}
        </Text>
      )}
      <Text variant="callout" tone="variant" align="end" className="tabular w-21">
        {size === null ? '—' : bytes(size)}
      </Text>
      <Text variant="callout" tone="variant" align="end" className="tabular w-22">
        {modifiedAt === null ? '—' : shortDate(modifiedAt)}
      </Text>
    </>
  );
}

export function EntryRow(props: EntryRowProps): ReactNode {
  const { name, kind, caption, size, modifiedAt, wide, selecting, selected, marks, by } = props;
  const { openLabel, menu, thumbnail, onOpen, onSelect, onContextMenu } = props;
  return (
    <View className="min-h-14 flex-row items-center border-t border-outline-variant pl-4 pr-1">
      <Interactive
        label={selecting ? `Select ${name}` : openLabel}
        selected={selecting ? selected : undefined}
        onPress={selecting ? onSelect : onOpen}
        onLongPress={onSelect}
        onContextMenu={onContextMenu}
        focusInset
        className="absolute inset-0"
      >
        {null}
      </Interactive>
      <View
        pointerEvents="none"
        className="min-w-0 flex-1 flex-row items-center gap-3 self-stretch"
      >
        <Leading
          kind={kind}
          name={name}
          selecting={selecting}
          selected={selected}
          thumbnail={thumbnail}
        />
        <Title
          name={name}
          caption={caption}
          marks={marks ?? NO_MARKS}
          highlight={props.nameHighlight ?? null}
          below={props.below}
          detail={props.detail}
        />
        {props.trailing ??
          (wide ? (
            <Columns size={size} modifiedAt={modifiedAt} {...(by === undefined ? {} : { by })} />
          ) : null)}
      </View>
      <OverflowButton
        items={menu}
        label={`Actions for ${name}`}
        {...(props.menuOptions === undefined ? {} : { options: props.menuOptions })}
      />
    </View>
  );
}
