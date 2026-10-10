import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { Switch } from '../../../components/switch';
import { confirm } from '../../../components/confirm-store';
import type { AutomationRow as AutomationRecord } from '@smarteverything/domain';
import type { Catalog, RuleView } from '../data/use-automations';
import {
  duplicateAutomation,
  removeAutomation,
  testRun,
  toggleAutomation,
  type SavedAutomation,
} from '../data/actions';
import { triggerIcon } from '../editor/kinds';
import { leadTrigger } from '../model/rules';

function subtitleOf(rule: RuleView): string {
  if (rule.definition === null) {
    return 'Can’t be read. Open to fix.';
  }
  if (rule.row.last_error !== null) {
    return `Last run failed: ${rule.row.last_error}`;
  }
  return rule.sentence ?? 'Not finished yet';
}

function runItems(
  saved: SavedAutomation | null,
  catalog: Catalog,
  taken: readonly string[],
): MenuItem[] {
  if (saved === null) {
    return [];
  }
  return [
    {
      label: 'Run now',
      icon: 'play',
      onPress: (): void => {
        void testRun(saved.name, saved.definition.actions, {
          devices: catalog.allDevices,
          scenes: catalog.scenes,
        });
      },
    },
    {
      label: 'Duplicate',
      icon: 'copy',
      onPress: (): void => {
        duplicateAutomation(saved, taken);
      },
    },
  ];
}

function deleteItem(row: AutomationRecord, saved: SavedAutomation | null): MenuItem {
  return {
    label: 'Delete',
    icon: 'trash',
    destructive: true,
    onPress: (): void => {
      void confirm({
        title: `Delete ${row.name}?`,
        confirmLabel: 'Delete',
        tone: 'destructive',
      }).then((accepted) => {
        if (accepted) {
          void removeAutomation(row.id, saved);
        }
      });
    },
  };
}

function useRowMenu(rule: RuleView, catalog: Catalog, taken: readonly string[]): MenuItem[] {
  const router = useRouter();
  const { row, definition } = rule;
  const saved = definition === null ? null : { name: row.name, enabled: row.enabled, definition };
  return [
    ...runItems(saved, catalog, taken),
    {
      label: 'Run history',
      icon: 'activity',
      onPress: (): void => {
        router.push(href.automationRuns(row.id));
      },
    },
    {
      label: row.enabled ? 'Pause' : 'Resume',
      icon: row.enabled ? 'timer' : 'play',
      onPress: (): void => {
        toggleAutomation(row.id, !row.enabled);
      },
    },
    deleteItem(row, saved),
  ];
}

export function AutomationRow({
  rule,
  catalog,
  taken,
  selected = false,
}: {
  readonly rule: RuleView;
  readonly catalog: Catalog;
  readonly taken: readonly string[];
  readonly selected?: boolean;
}): ReactNode {
  const lead = leadTrigger(rule.definition);
  const attention = rule.section === 'attention';
  return (
    <ListRow
      title={rule.row.name}
      subtitle={subtitleOf(rule)}
      subtitleTone={attention ? 'critical' : 'variant'}
      icon={attention || lead === null ? 'alert' : triggerIcon(lead, catalog.allDevices)}
      iconTone={attention ? 'critical' : 'primary'}
      href={href.automation(rule.row.id)}
      selected={selected}
      contextMenu={useRowMenu(rule, catalog, taken)}
      trailing={
        <Switch
          label={`${rule.row.name} on`}
          value={rule.row.enabled}
          disabled={rule.definition === null}
          onChange={(enabled) => {
            toggleAutomation(rule.row.id, enabled);
          }}
        />
      }
    />
  );
}
