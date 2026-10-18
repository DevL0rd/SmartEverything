import { memo, type ReactNode } from 'react';
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
  testSavedRun,
  toggleAutomation,
  type SavedAutomation,
} from '../data/actions';
import { triggerV2Icon } from '../editor/kinds';
import { leadTrigger } from '../model/rules';
import { shallowEqual } from '../../../store/store-context';
import { background } from '@smarteverything/logging';

function subtitleOf(rule: RuleView): string {
  if (rule.automation === null) {
    return 'Can’t be read. Open to fix.';
  }
  if (rule.row.last_error !== null) {
    return `Last run failed: ${rule.row.last_error}`;
  }
  return rule.sentence ?? 'Not finished yet';
}

function runItems(
  automationId: string,
  saved: SavedAutomation | null,
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
        background(testSavedRun(automationId, saved.name), 'saved_run.test_failed');
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

function deleteItem(row: AutomationRecord): MenuItem {
  return {
    label: 'Delete',
    icon: 'trash',
    destructive: true,
    onPress: (): void => {
      background(
        confirm({
          title: `Delete ${row.name}?`,
          confirmLabel: 'Delete',
          tone: 'destructive',
        }).then((accepted) => {
          if (accepted) {
            removeAutomation(row.id);
          }
        }),
        'automation_row.confirm_failed',
      );
    },
  };
}

function useRowMenu(rule: RuleView, taken: readonly string[]): MenuItem[] {
  const router = useRouter();
  const { row, automation } = rule;
  const saved =
    automation === null ? null : { name: row.name, enabled: row.enabled, definition: automation };
  return [
    ...runItems(row.id, saved, taken),
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
    deleteItem(row),
  ];
}

interface AutomationRowProps {
  readonly rule: RuleView;
  readonly catalog: Catalog;
  readonly taken: readonly string[];
  readonly selected?: boolean;
}

function sameRow(left: AutomationRowProps, right: AutomationRowProps): boolean {
  return (
    left.rule === right.rule &&
    left.catalog === right.catalog &&
    left.selected === right.selected &&
    shallowEqual(left.taken, right.taken)
  );
}

export const AutomationRow = memo(function AutomationRow({
  rule,
  catalog,
  taken,
  selected = false,
}: AutomationRowProps): ReactNode {
  const lead = leadTrigger(rule.automation);
  const attention = rule.section === 'attention';
  return (
    <ListRow
      title={rule.row.name}
      subtitle={subtitleOf(rule)}
      subtitleTone={attention ? 'critical' : 'variant'}
      icon={attention ? 'alert' : triggerV2Icon(lead, catalog.allDevices)}
      iconTone={attention ? 'critical' : 'primary'}
      href={href.automation(rule.row.id)}
      selected={selected}
      contextMenu={useRowMenu(rule, taken)}
      trailing={
        <Switch
          label={`${rule.row.name} on`}
          value={rule.row.enabled}
          disabled={rule.automation === null}
          onChange={(enabled) => {
            toggleAutomation(rule.row.id, enabled);
          }}
        />
      }
    />
  );
}, sameRow);
