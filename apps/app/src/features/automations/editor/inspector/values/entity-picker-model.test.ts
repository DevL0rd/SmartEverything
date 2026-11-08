import { describe, expect, it } from 'vitest';
import type { PluginOption, PluginOptionPage } from '@smarteverything/domain';
import { PLUGIN_PREFIX } from '../../../../../queries/keys';
import {
  MISSING_ENTITY,
  chosenNote,
  chosenViewOf,
  entityChoices,
  entityKey,
  entityRefOf,
  heldEntity,
  type ChosenView,
} from './entity-picker-model';
import { summaryOf } from './option-picker-model';

function option(id: string, label: string, detail: string | null = null): PluginOption {
  return { id, label, detail, color: '#5865f2', image: null };
}

const KITCHEN = option('101', '#kitchen', 'Home server');
const HALL = option('102', '#hall');

function page(options: readonly PluginOption[], next: string | null = null): PluginOptionPage {
  return { state: 'ready', options: [...options], next };
}

const OFF: PluginOptionPage = { state: 'unavailable', message: 'Discord is switched off.' };

describe('entity references', () => {
  it('splits the entity type into the plugin and its entity', () => {
    expect(entityRefOf('discord.channel')).toEqual({ pluginId: 'discord', entity: 'channel' });
    expect(entityRefOf('shelly-presence.zone.room')).toEqual({
      pluginId: 'shelly-presence',
      entity: 'zone.room',
    });
  });

  it('refuses a type that names no plugin', () => {
    expect(entityRefOf('channel')).toBeNull();
    expect(entityRefOf('.channel')).toBeNull();
    expect(entityRefOf('discord.')).toBeNull();
  });

  it('keys queries under the plugin so plugin changes refresh them', () => {
    const key = entityKey({ pluginId: 'discord', entity: 'channel' }, ['page', 'kit']);
    expect(key.slice(0, PLUGIN_PREFIX.length)).toEqual([...PLUGIN_PREFIX]);
    expect(key).toContain('discord');
    expect(key).toContain('channel');
  });

  it('holds only a non-empty id', () => {
    expect(heldEntity('101')).toBe('101');
    expect(heldEntity('')).toBeNull();
    expect(heldEntity(101)).toBeNull();
    expect(heldEntity(undefined)).toBeNull();
  });
});

function shownFor(view: ChosenView): string {
  if (view.state === 'none') return summaryOf([], [], 'Pick one');
  const id = view.state === 'found' ? view.option.id : view.id;
  return summaryOf(entityChoices([], view), [id], 'Pick one');
}

describe('the picker rows', () => {
  it('lists the page and keeps the chosen entity when the page lacks it', () => {
    const view = chosenViewOf('102', page([HALL]), null);
    expect(entityChoices([KITCHEN], view).map((row) => row.id)).toEqual(['101', '102']);
    expect(entityChoices([KITCHEN, HALL], view).map((row) => row.id)).toEqual(['101', '102']);
  });

  it('marks a chosen id the plugin cannot list with the reason', () => {
    expect(entityChoices([], chosenViewOf('999', page([KITCHEN]), null))).toEqual([
      { id: '999', label: '999', unavailable: MISSING_ENTITY },
    ]);
    expect(entityChoices([], chosenViewOf('101', OFF, null))).toEqual([
      { id: '101', label: '101', unavailable: 'Discord is switched off.' },
    ]);
  });

  it('carries the detail of a listed entity', () => {
    expect(entityChoices([KITCHEN], chosenViewOf(null, undefined, null))).toEqual([
      { id: '101', label: '#kitchen', detail: 'Home server' },
    ]);
  });
});

describe('the chosen entity', () => {
  it('shows the placeholder with nothing chosen', () => {
    const view = chosenViewOf(null, undefined, null);
    expect(shownFor(view)).toBe('Pick one');
    expect(chosenNote(view)).toBeNull();
  });

  it('shows the looked up label, detail and colour of the chosen id', () => {
    const view = chosenViewOf('101', page([KITCHEN]), null);
    expect(view).toEqual({ state: 'found', option: KITCHEN });
    expect(shownFor(view)).toBe('#kitchen');
    expect(chosenNote(view)).toBe('Home server');
  });

  it('uses the option just picked before the lookup returns', () => {
    expect(chosenViewOf('102', undefined, HALL)).toEqual({ state: 'found', option: HALL });
    expect(chosenViewOf('101', undefined, HALL)).toEqual({ state: 'loading', id: '101' });
  });

  it('keeps the id and says it is gone when the plugin no longer lists it', () => {
    const view = chosenViewOf('999', page([KITCHEN]), null);
    expect(shownFor(view)).toBe('999');
    expect(chosenNote(view)).toBe(MISSING_ENTITY);
  });

  it('shows the plugin’s reason in place when it cannot look the id up', () => {
    const view = chosenViewOf('101', OFF, null);
    expect(shownFor(view)).toBe('101');
    expect(chosenNote(view)).toBe('Discord is switched off.');
  });
});
