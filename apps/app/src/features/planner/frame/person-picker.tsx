import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { useAnchoredMenu } from '../../../components/menu';
import type { PersonChoice } from './person';
import { personChoiceItem } from './planner-menu';

export function PersonPicker({ people }: { readonly people: readonly PersonChoice[] }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(people.map(personChoiceItem), 'Show the planner of');
  const shown = people.find((choice) => choice.shown);
  return (
    <View ref={ref} collapsable={false} className="flex-row">
      <Button
        label={`Showing: ${shown?.name ?? 'You'}`}
        icon="users"
        variant="outlined"
        onPress={open}
      />
      {menu}
    </View>
  );
}
