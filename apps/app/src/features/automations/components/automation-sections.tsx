import type { ReactNode } from 'react';
import { View } from 'react-native';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import type { Catalog, RuleView } from '../data/use-automations';
import { LIST_SECTIONS, SECTION_TITLES, matchesQuery } from '../model/rules';
import { AutomationRow } from './automation-row';

export function AutomationSections({
  rules,
  catalog,
  query,
  selectedId = null,
}: {
  readonly rules: readonly RuleView[];
  readonly catalog: Catalog;
  readonly query: string;
  readonly selectedId?: string | null;
}): ReactNode {
  const shown = rules.filter((rule) => matchesQuery(rule.row.name, rule.sentence, query));
  const taken = rules.map((rule) => rule.row.name);
  if (shown.length === 0) {
    return (
      <Text variant="body" tone="variant" align="center" className="py-6">
        {`Nothing matches “${query.trim()}”`}
      </Text>
    );
  }
  return (
    <View className="gap-section-gap">
      {LIST_SECTIONS.map((section) => {
        const inSection = shown.filter((rule) => rule.section === section);
        return inSection.length === 0 ? null : (
          <List key={section} title={SECTION_TITLES[section]} inset>
            {inSection.map((rule) => (
              <AutomationRow
                key={rule.row.id}
                rule={rule}
                catalog={catalog}
                taken={taken}
                selected={rule.row.id === selectedId}
              />
            ))}
          </List>
        );
      })}
    </View>
  );
}
