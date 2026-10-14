import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from './button';
import { Text } from './text';
import { DecisionOptions } from './decision-options';
import type { ApprovalOption } from './decision-choices';
export function DecisionApproval({
  options,
  pending,
  answer,
}: {
  readonly options: readonly ApprovalOption[];
  readonly pending: boolean;
  readonly answer: (id: string) => void;
}): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  const allow = options.filter((option) => option.effect === 'allow');
  const chosen = allow.length === 1 ? allow[0] : allow.find((option) => option.id === selected);
  return (
    <View className="gap-3">
      {allow.length <= 1 ? null : (
        <DecisionOptions
          options={allow}
          selected={selected === null ? [] : [selected]}
          multi={false}
          disabled={pending}
          choose={setSelected}
        />
      )}
      {allow.length === 1 && chosen?.description !== undefined ? (
        <Text variant="footnote" tone="variant" selectable>
          {chosen.description}
        </Text>
      ) : null}
      <ApprovalActions options={options} chosen={chosen} pending={pending} answer={answer} />
    </View>
  );
}
interface ApprovalActionsProps {
  readonly options: readonly ApprovalOption[];
  readonly chosen: ApprovalOption | undefined;
  readonly pending: boolean;
  readonly answer: (id: string) => void;
}
function ApprovalActions({ options, chosen, pending, answer }: ApprovalActionsProps): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap justify-end gap-2">
        {options
          .filter((option) => option.effect === 'deny')
          .map((option) => (
            <Button
              key={option.id}
              label={option.label}
              size="lg"
              variant="outlined"
              disabled={pending}
              onPress={() => {
                answer(option.id);
              }}
            />
          ))}
        {options.some((option) => option.effect === 'allow') ? (
          <Button
            label={chosen?.label ?? 'Choose approval scope'}
            size="lg"
            disabled={pending || chosen === undefined}
            onPress={() => {
              if (chosen !== undefined) answer(chosen.id);
            }}
          />
        ) : null}
      </View>
      {options
        .filter((option) => option.effect === 'cancel')
        .map((option) => (
          <Button
            key={option.id}
            label={option.label}
            size="lg"
            variant="text"
            disabled={pending}
            onPress={() => {
              answer(option.id);
            }}
          />
        ))}
      <UnknownChoices options={options} />
    </View>
  );
}

function UnknownChoices({ options }: { readonly options: readonly ApprovalOption[] }): ReactNode {
  return (
    <>
      {options
        .filter((option) => option.effect === 'unknown')
        .map((option) => (
          <DecisionOptions
            key={option.id}
            options={[option]}
            selected={[]}
            multi={false}
            disabled
            choose={() => undefined}
          />
        ))}
    </>
  );
}
