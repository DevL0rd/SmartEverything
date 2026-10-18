import type { ReactNode } from 'react';
import type { AiModelKind } from '@smarteverything/domain';
import type { ModelChoice, ModelPick } from '../picker/model-choice';
import type { NativeModelRequest } from '../provider/subscription-models';

export interface ModelCandidate {
  readonly key: string;
  readonly model: ModelChoice;
  readonly selected: boolean;
  readonly favourite: boolean;
  readonly render: () => ReactNode;
  readonly pick: (() => void) | null;
}

export interface SourceStatus {
  readonly name: string;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}

export interface CandidateSource {
  readonly candidates: readonly ModelCandidate[];
  readonly status: SourceStatus | null;
}

export interface ModelPickerProps {
  readonly kind?: AiModelKind;
  readonly initialQuery?: string;
  readonly picked: ModelPick | null;
  readonly onPick: ((pick: ModelPick) => void) | null;
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
}

export interface CandidateSources {
  readonly native: readonly ModelCandidate[];
  readonly routes: readonly ModelCandidate[];
  readonly catalogue: readonly ModelCandidate[];
}

function sameModel(left: ModelCandidate, right: ModelCandidate): boolean {
  return (
    left.model.id === right.model.id &&
    left.model.catalogueSupplier === right.model.catalogueSupplier
  );
}

export function mergeCandidates(sources: CandidateSources): readonly ModelCandidate[] {
  return [
    ...sources.native,
    ...sources.routes,
    ...sources.catalogue.filter(
      (candidate) => !sources.routes.some((route) => sameModel(route, candidate)),
    ),
  ];
}
