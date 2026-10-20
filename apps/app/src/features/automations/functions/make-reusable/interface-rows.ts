import { entryReferences, type PortReference } from '@smarteverything/flow/check/references';
import type { Extraction } from '@smarteverything/flow/extract/extract';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { plainReference, typeText, type TitleOf } from './plain-reference';

export interface InputRow {
  readonly name: string;
  readonly typeText: string;
  readonly required: boolean;
  readonly reason: string;
  readonly was: string;
}

export interface OutputRow {
  readonly name: string;
  readonly typeText: string;
  readonly optional: boolean;
  readonly usedBy: string;
}

export interface InterfaceRows {
  readonly inputs: readonly InputRow[];
  readonly outputs: readonly OutputRow[];
  readonly exits: readonly string[];
}

const SEPARATOR = ' › ';

function placeOf(key: string, reference: PortReference, titleOf: TitleOf): string {
  const { site } = reference;
  if (site.kind === 'port') return `${titleOf(key)}${SEPARATOR}${site.port}`;
  if (site.kind === 'variable') return `variable ${site.name}`;
  return titleOf(key);
}

function placesReading(
  extraction: Extraction,
  which: 'callee' | 'caller',
  match: (reference: PortReference, key: string) => boolean,
  titleOf: TitleOf,
): readonly string[] {
  const index = indexProgram(extraction[which]);
  const places = index.nodes.flatMap((entry) =>
    entryReferences(entry)
      .filter((reference) => match(reference, entry.node.key))
      .map((reference) => placeOf(entry.node.key, reference, titleOf)),
  );
  return [...new Set(places)];
}

function inputRows(extraction: Extraction, titleOf: TitleOf): readonly InputRow[] {
  const instance = indexProgram(extraction.caller).byKey.get(extraction.instanceKey)?.node;
  return extraction.callee.inputs.map((input) => {
    const readers = placesReading(
      extraction,
      'callee',
      (reference) => reference.from === 'inputs' && reference.port === input.name,
      titleOf,
    );
    const argument = instance?.ports?.[input.name];
    return {
      name: input.name,
      typeText: typeText(input.type),
      required: input.required,
      reason: readers.length === 0 ? 'Read by the steps' : `Read by ${readers.join(', ')}`,
      was:
        argument === undefined ? 'Given by the caller' : `Was ${plainReference(argument, titleOf)}`,
    };
  });
}

function outputRows(extraction: Extraction, titleOf: TitleOf): readonly OutputRow[] {
  const { instanceKey } = extraction;
  return extraction.callee.outputs.map((output) => {
    const users = placesReading(
      extraction,
      'caller',
      (reference, key) =>
        key !== instanceKey && reference.from === instanceKey && reference.port === output.name,
      titleOf,
    );
    return {
      name: output.name,
      typeText: typeText(output.type),
      optional: output.optional === true,
      usedBy: users.length === 0 ? 'Not used later' : `Used by ${users.join(', ')}`,
    };
  });
}

export function interfaceRows(extraction: Extraction, titleOf: TitleOf): InterfaceRows {
  return {
    inputs: inputRows(extraction, titleOf),
    outputs: outputRows(extraction, titleOf),
    exits: extraction.callee.exits,
  };
}

export function summaryLine(rows: InterfaceRows): string {
  const names = (list: readonly { readonly name: string }[]): string =>
    list.length === 0 ? 'nothing' : list.map((row) => row.name).join(', ');
  return `in: ${names(rows.inputs)} · out: ${names(rows.outputs)}`;
}
