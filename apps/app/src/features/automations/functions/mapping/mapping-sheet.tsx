import type {
  AutomationFunctionChange,
  AutomationFunctionInterface,
  AutomationFunctionMapping,
  AutomationFunctionUser,
} from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { SwitchRow } from '../../../../components/rows';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { ChangeCard } from './change-card';
import {
  INITIAL_STATE,
  answerFor,
  mappingCards,
  setAnswer,
  setUniform,
  toMapping,
  type MappingCard,
  type MappingState,
} from './mapping-model';

export interface MappingSheetProps {
  readonly open: boolean;
  readonly functionName: string;
  readonly version: number;
  readonly callersOn: number;
  readonly changes: readonly AutomationFunctionChange[];
  readonly callers: readonly AutomationFunctionUser[];
  readonly next: AutomationFunctionInterface;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly onClose: () => void;
  readonly onKeep: () => void;
  readonly onUpdateAll: (mapping: AutomationFunctionMapping) => void;
}

type FormProps = Omit<MappingSheetProps, 'open' | 'onClose'> & { readonly onClose: () => void };

function Cards({
  cards,
  state,
  onState,
}: {
  readonly cards: readonly MappingCard[];
  readonly state: MappingState;
  readonly onState: (state: MappingState) => void;
}): ReactNode {
  const shown = state.uniform ? cards.slice(0, 1) : cards;
  return (
    <View className="gap-3">
      {shown.map((card) => (
        <ChangeCard
          key={card.callerId}
          title={state.uniform ? `All ${String(cards.length)} callers` : card.callerName}
          caption={card.versionLabel}
          entries={card.entries}
          answerOf={(entry) => answerFor(state, card.callerId, entry)}
          onAnswer={(entry, answer) => {
            onState(setAnswer(state, card.callerId, entry, answer));
          }}
        />
      ))}
      {state.uniform && cards.length > 1 ? (
        <Text variant="footnote" tone="variant">
          {`Callers: ${cards.map((card) => card.callerName).join(', ')}`}
        </Text>
      ) : null}
    </View>
  );
}

function Issues({
  issues,
  failure,
}: {
  readonly issues: readonly string[];
  readonly failure: string | null;
}): ReactNode {
  const all = failure === null ? issues : [...issues, failure];
  if (all.length === 0) return null;
  return (
    <View accessibilityLiveRegion="polite" className="gap-0.5">
      {all.map((issue) => (
        <Text key={issue} variant="footnote" tone="critical">
          {issue}
        </Text>
      ))}
    </View>
  );
}

function Form(props: FormProps): ReactNode {
  const { changes, callers, next, callersOn } = props;
  const cards = useMemo(
    () => mappingCards(changes, callers, next, callersOn),
    [changes, callers, next, callersOn],
  );
  const [state, setState] = useState<MappingState>(INITIAL_STATE);
  const result = toMapping(state, cards, next);
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant">
        {`${props.functionName} is now version ${String(props.version)}. Choose what each caller uses instead.`}
      </Text>
      <SwitchRow
        title="Use one answer for all"
        value={state.uniform}
        onChange={(uniform) => {
          setState(setUniform(state, uniform, cards));
        }}
      />
      <Cards cards={cards} state={state} onState={setState} />
      <Issues issues={result.ok ? [] : result.issues} failure={props.failure} />
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        <Button label="Cancel" variant="text" disabled={props.busy} onPress={props.onClose} />
        <Button
          label={`Publish and keep callers on version ${String(callersOn)}`}
          variant="outlined"
          disabled={props.busy}
          onPress={props.onKeep}
        />
        <Button
          label="Update all callers"
          loading={props.busy}
          disabled={!result.ok}
          onPress={() => {
            if (result.ok) props.onUpdateAll(result.mapping);
          }}
        />
      </View>
    </View>
  );
}

export function MappingSheet({ open, ...rest }: MappingSheetProps): ReactNode {
  return (
    <Sheet open={open} onClose={rest.onClose} title="This update needs mapping" wide>
      {open ? <Form {...rest} /> : null}
    </Sheet>
  );
}
