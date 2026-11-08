import { describe, expect, it } from 'vitest';
import { roomIconOf } from '../../../components/room-icon';
import { roomStatusLine, selectedRoomStatusLine } from './room-band';

describe('the icon of a room', () => {
  it('follows the kind of room in its name', () => {
    expect(roomIconOf('Master Bedroom')).toBe('bed');
    expect(roomIconOf('Living room')).toBe('sofa');
    expect(roomIconOf('Kitchen')).toBe('utensils');
    expect(roomIconOf('Home office')).toBe('monitor');
  });

  it('does not read a kind into the middle of a word', () => {
    expect(roomIconOf('Garden')).toBe('leaf');
  });

  it('falls back to a house for a room it cannot place', () => {
    expect(roomIconOf('Zorblax')).toBe('home');
  });
});

describe('the live line of a room', () => {
  it('says how many devices are on out of all of them', () => {
    expect(roomStatusLine({ devices: 8, on: 3, offline: 0, lightsOn: 1 })).toBe('3 of 8 on');
  });

  it('says all off when nothing is on and adds the offline count', () => {
    expect(roomStatusLine({ devices: 4, on: 0, offline: 2, lightsOn: 0 })).toBe(
      'All off · 2 offline',
    );
  });
});

describe('the device band under a selected room summary', () => {
  it('keeps power, offline and light counts beside the cards', () => {
    expect(selectedRoomStatusLine({ devices: 8, on: 3, offline: 2, lightsOn: 1 }, 8)).toBe(
      '3 of 8 on · 2 offline · 1 light on',
    );
  });

  it('counts shown devices when the visible room summary has fewer devices', () => {
    expect(selectedRoomStatusLine({ devices: 1, on: 0, offline: 1, lightsOn: 0 }, 2)).toBe(
      '2 devices shown · All off · 1 offline',
    );
  });

  it('says all off when neither devices nor lights are on', () => {
    expect(selectedRoomStatusLine({ devices: 4, on: 0, offline: 0, lightsOn: 0 }, 4)).toBe(
      'All off',
    );
  });
});
