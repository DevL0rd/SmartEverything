import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../../../components/anchor';
import { IconButton } from '../../../../../components/icon-button';
import { ListRow } from '../../../../../components/list-row';
import { List, Section } from '../../../../../components/section';
import { SelectPicker } from '../../../../../components/select-picker';
import { Text } from '../../../../../components/text';
import {
  NOTHING_LEADS_HERE,
  clearIntent,
  connectIntent,
  connectionsOf,
  hasConnections,
  targetChoices,
  type ConnectionRow,
  type GraphSectionProps,
} from './graph-connections-model';

const SEARCHABLE_FROM = 8;

function TargetPicker({
  section,
  row,
  anchor,
  onClose,
}: {
  readonly section: GraphSectionProps;
  readonly row: ConnectionRow;
  readonly anchor: Rect | null;
  readonly onClose: () => void;
}): ReactNode {
  const { program, node, kinds, actions } = section;
  const choices = anchor === null ? [] : targetChoices(program, node, row.port, kinds);
  return (
    <SelectPicker
      label={`${row.label} goes to`}
      options={choices.map((choice) => ({
        value: choice.key,
        label: choice.name,
        description: choice.description,
      }))}
      value={row.target?.key ?? null}
      anchor={anchor}
      searchable={choices.length > SEARCHABLE_FROM}
      onPick={(key) => {
        const picked = choices.find((choice) => choice.key === key);
        if (picked !== undefined) actions.intent(connectIntent(node, row.port, picked));
      }}
      onClose={onClose}
    />
  );
}

function ConnectionLine({
  section,
  row,
}: {
  readonly section: GraphSectionProps;
  readonly row: ConnectionRow;
}): ReactNode {
  const { node, locked, actions } = section;
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <View className="flex-row items-center">
      <View ref={ref} collapsable={false} className="flex-1">
        <ListRow
          title={row.label}
          value={row.targetText}
          chevron
          disabled={locked}
          onPress={() => {
            measureAnchor(ref, setAnchor);
          }}
        />
        <TargetPicker
          section={section}
          row={row}
          anchor={anchor}
          onClose={() => {
            setAnchor(null);
          }}
        />
      </View>
      <IconButton
        icon="close"
        label={`Clear ${row.label}`}
        disabled={locked || row.target === undefined}
        onPress={() => {
          actions.intent(clearIntent(node, row.port));
        }}
      />
    </View>
  );
}

function ComesFrom({ section }: { readonly section: GraphSectionProps }): ReactNode {
  const { program, node, kinds, actions } = section;
  const { incoming } = connectionsOf(program, node, kinds);
  return (
    <Section title="Comes from">
      {incoming.length === 0 ? (
        <View className="px-4 py-2">
          <Text variant="footnote" tone="variant">
            {NOTHING_LEADS_HERE}
          </Text>
        </View>
      ) : (
        <View className="px-4">
          <List>
            {incoming.map((row) => (
              <ListRow
                key={row.id}
                title={row.text}
                icon="arrowRight"
                chevron
                label={`Go to ${row.source.name}`}
                onPress={() => {
                  actions.jump(row.source.id);
                }}
              />
            ))}
          </List>
        </View>
      )}
    </Section>
  );
}

export function GraphConnections(section: GraphSectionProps): ReactNode {
  const { program, node, kinds } = section;
  if (!hasConnections(node, kinds)) return null;
  const model = connectionsOf(program, node, kinds);
  return (
    <>
      {model.rows.length === 0 ? null : (
        <Section title="Goes to">
          <View className="px-4">
            <List>
              {model.rows.map((row) => (
                <ConnectionLine key={row.port} section={section} row={row} />
              ))}
            </List>
          </View>
        </Section>
      )}
      {model.acceptsInput ? <ComesFrom section={section} /> : null}
    </>
  );
}
