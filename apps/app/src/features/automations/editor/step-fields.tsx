import type { ReactNode } from 'react';
import type { StepV2 } from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { isFlowStep, type FlowStep } from '../model/steps';
import { ComputerAudioFields } from './computer-audio-fields';
import { ComputerDisplayFields } from './computer-display-fields';
import { ControlFields } from './control-fields';
import { IfFields } from './if-fields';
import { RepeatFields } from './repeat-fields';
import { RunStepFields } from './run-step-fields';
import {
  AiStepFields,
  NoticeStepFields,
  SceneStepFields,
  StopStepFields,
  ToolStepFields,
  WaitStepFields,
} from './simple-step-fields';
import { ValueStepFields } from './value-step-fields';

interface StepFieldsProps {
  readonly step: StepV2;
  readonly catalog: Catalog;
  readonly onChange: (step: StepV2) => void;
}

function FlowFields({
  step,
  catalog,
  onChange,
}: StepFieldsProps & { readonly step: FlowStep }): ReactNode {
  switch (step.do) {
    case 'value':
      return <ValueStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'if':
      return <IfFields catalog={catalog} step={step} onChange={onChange} />;
    case 'repeat':
      return <RepeatFields catalog={catalog} step={step} onChange={onChange} />;
    case 'run':
      return <RunStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'stop':
      return <StopStepFields catalog={catalog} step={step} onChange={onChange} />;
  }
}

export function StepFields({ step, catalog, onChange }: StepFieldsProps): ReactNode {
  if (isFlowStep(step)) return <FlowFields step={step} catalog={catalog} onChange={onChange} />;
  switch (step.do) {
    case 'set':
      return <ControlFields catalog={catalog} step={step} onChange={onChange} />;
    case 'scene':
      return <SceneStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'wait':
      return <WaitStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'notify':
      return <NoticeStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'ai':
      return <AiStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'tool':
      return <ToolStepFields catalog={catalog} step={step} onChange={onChange} />;
    case 'audio':
      return <ComputerAudioFields catalog={catalog} step={step} onChange={onChange} />;
    case 'display':
      return <ComputerDisplayFields catalog={catalog} step={step} onChange={onChange} />;
  }
}
