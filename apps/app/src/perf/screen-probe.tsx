import type { ReactElement } from 'react';
import { createContext, Profiler, useContext, useLayoutEffect, useState } from 'react';
import { developerFlags } from '../developer/flags';
import { sinkOf } from './sink';

const LayerContext = createContext('');

interface ScreenProbeArgs {
  readonly route: { readonly name: string };
  readonly children: ReactElement;
}

function ProbedLayer({ route, children }: ScreenProbeArgs): ReactElement {
  'use no memo';
  const parent = useContext(LayerContext);
  const label = parent === '' ? route.name : `${parent}>${route.name}`;
  const [born] = useState(() => performance.now());
  useLayoutEffect(() => {
    const mounted = performance.now();
    sinkOf()?.screenMount(label, mounted - born);
    return (): void => {
      sinkOf()?.screenUnmount(label, performance.now() - mounted);
    };
  }, [label, born]);
  return (
    <LayerContext value={label}>
      <Profiler
        id={`@${label}`}
        onRender={(_id, phase, actual) => {
          sinkOf()?.screenCommit(label, phase, actual);
        }}
      >
        {children}
      </Profiler>
    </LayerContext>
  );
}

export function probedScreen(args: ScreenProbeArgs): ReactElement {
  return __DEV__ && developerFlags['perf.profilers'] ? <ProbedLayer {...args} /> : args.children;
}
