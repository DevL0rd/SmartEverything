import { SIGNAL_SOURCES, pluginSignalSpec, type SignalSourceSpec } from '@smarteverything/domain';

export interface InstalledPlugins {
  readonly plugins: {
    list: () => readonly { readonly manifest: Parameters<typeof pluginSignalSpec>[0] }[];
  };
}

export function installedSignalSources(home: InstalledPlugins): readonly SignalSourceSpec[] {
  return [...SIGNAL_SOURCES, ...home.plugins.list().map((row) => pluginSignalSpec(row.manifest))];
}
