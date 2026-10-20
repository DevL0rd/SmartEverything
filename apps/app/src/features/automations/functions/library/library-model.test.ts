import { describe, expect, it } from 'vitest';
import type { AutomationFunctionSummary } from '@smarteverything/domain';
import {
  EMPTY_FILTER,
  categoriesOf,
  interfaceLine,
  libraryEmpty,
  libraryRows,
  librarySections,
  usersLabel,
} from './library-model';

function summary(
  id: string,
  over: Partial<AutomationFunctionSummary> = {},
): AutomationFunctionSummary {
  return {
    id,
    name: id,
    description: null,
    category: null,
    icon: null,
    builtin: false,
    editable: true,
    revision: 3,
    interface: {
      flavour: 'action',
      inputs: [{ name: 'lights', type: { t: 'any' }, required: true }],
      outputs: [{ name: 'level', type: { t: 'number' } }],
      exits: ['done'],
    },
    interfaceHash: 'h',
    users: 2,
    createdBy: 'me',
    updatedAt: null,
    ...over,
  };
}

const CONTEXT = { userId: 'me', needsMapping: new Set(['theirs']) };

describe('library model', () => {
  it('writes the interface line from port names', () => {
    expect(interfaceLine(summary('a').interface)).toBe('in: lights · out: level');
    expect(interfaceLine({ inputs: [], outputs: [] })).toBe('in: nothing · out: nothing');
  });

  it('splits rows into my, built in and shared sections in order', () => {
    const rows = libraryRows(
      [
        summary('theirs', { createdBy: 'other' }),
        summary('Zed'),
        summary('Abc'),
        summary('sys', { builtin: true, editable: false, createdBy: null }),
      ],
      CONTEXT,
    );
    const sections = librarySections(rows, EMPTY_FILTER);
    expect(sections.map((section) => section.id)).toEqual(['mine', 'builtin', 'shared']);
    expect(sections[0]?.rows.map((row) => row.name)).toEqual(['Abc', 'Zed']);
    expect(rows.find((row) => row.id === 'theirs')?.needsMapping).toBe(true);
    expect(rows.find((row) => row.id === 'Abc')?.versionLabel).toBe('Version 3');
  });

  it('labels the kind with the design words', () => {
    const rows = libraryRows(
      [summary('v', { interface: { ...summary('v').interface, flavour: 'pure' } }), summary('s')],
      CONTEXT,
    );
    expect(rows.map((row) => row.kindLabel)).toEqual(['Value node', 'Step node']);
  });

  it('filters by search text and category and lists categories', () => {
    const rows = libraryRows(
      [summary('Fade', { category: 'Lights' }), summary('Ping', { category: 'Notify' })],
      CONTEXT,
    );
    expect(categoriesOf(rows)).toEqual(['Lights', 'Notify']);
    expect(librarySections(rows, { query: 'fad', category: null })[0]?.rows).toHaveLength(1);
    expect(librarySections(rows, { query: '', category: 'Notify' })[0]?.rows[0]?.name).toBe('Ping');
    expect(librarySections(rows, { query: 'lights', category: null })[0]?.rows).toHaveLength(2);
  });

  it('counts users in plain words', () => {
    expect(usersLabel(0)).toBe('Not used yet');
    expect(usersLabel(1)).toBe('Used in 1 place');
    expect(usersLabel(6)).toBe('Used in 6 places');
  });

  it('tells empty states apart', () => {
    const none = libraryRows([], CONTEXT);
    expect(libraryEmpty(none, librarySections(none, EMPTY_FILTER), EMPTY_FILTER)).toBe('none-yet');
    const builtins = libraryRows([summary('sys', { builtin: true })], CONTEXT);
    expect(libraryEmpty(builtins, librarySections(builtins, EMPTY_FILTER), EMPTY_FILTER)).toBe(
      'no-own',
    );
    const filter = { query: 'zzz', category: null };
    expect(libraryEmpty(builtins, librarySections(builtins, filter), filter)).toBe('no-match');
  });
});
