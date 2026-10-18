import type { PluginManifestInput } from '@smarteverything/domain';

type WidgetInput = NonNullable<NonNullable<PluginManifestInput['contributes']>['widgets']>[number];

export function figureWidget(id: string, title: string, icon: string, stream: string): WidgetInput {
  return {
    id,
    title,
    icon,
    sizes: ['M'],
    body: { type: 'figure', value: { stream }, caption: null },
  };
}
