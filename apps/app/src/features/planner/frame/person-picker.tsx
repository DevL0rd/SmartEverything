import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { showPlannerPerson, type PersonChoice } from './person';

function choiceItem(choice: PersonChoice): MenuItem {
  return {
    id: `person-${choice.person ?? 'me'}`,
    label: choice.name,
    icon: choice.shown ? 'check' : 'user',
    onPress: (): void => {
      showPlannerPerson(choice.person);
    },
  };
}

export function PersonPicker({ people }: { readonly people: readonly PersonChoice[] }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(people.map(choiceItem), 'Show the planner of');
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
