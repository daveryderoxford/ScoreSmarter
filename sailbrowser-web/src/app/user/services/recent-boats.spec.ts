import { describe, expect, it } from 'vitest';
import type { Boat } from 'app/boats';
import { pushRecentBoat } from './recent-boats';

describe('pushRecentBoat', () => {
  const boatA: Boat = {
    id: 'boat-1',
    sailNumber: '1234',
    boatClass: 'Laser',
    name: '',
    helm: 'Alice',
    crew: '',
    isClub: false,
  };

  const boatB: Boat = {
    id: 'boat-2',
    sailNumber: '5678',
    boatClass: 'RS Aero',
    name: '',
    helm: 'Bob',
    crew: '',
    isClub: false,
  };

  const boatC: Boat = {
    id: 'boat-3',
    sailNumber: '9999',
    boatClass: 'Solo',
    name: '',
    helm: 'Charlie',
    crew: '',
    isClub: false,
  };

  it('adds a boat to an empty list', () => {
    const result = pushRecentBoat([], boatA);
    expect(result).toEqual([boatA]);
  });

  it('handles undefined existing list gracefully', () => {
    const result = pushRecentBoat(undefined, boatA);
    expect(result).toEqual([boatA]);
  });

  it('prepends a new boat to existing boats', () => {
    const result = pushRecentBoat([boatB], boatA);
    expect(result).toEqual([boatA, boatB]);
  });

  it('deduplicates and moves re-entered boat to the top by id', () => {
    const result = pushRecentBoat([boatB, boatA, boatC], { ...boatA, crew: 'New Crew' });
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('boat-1');
    expect(result[0].crew).toBe('New Crew');
    expect(result[1]).toEqual(boatB);
    expect(result[2]).toEqual(boatC);
  });

  it('deduplicates by class and sailNumber even if ephemeral ids differ', () => {
    const existing: Boat = {
      id: 'new-1111',
      sailNumber: '1234',
      boatClass: 'Laser',
      name: '',
      helm: 'Alice',
      crew: '',
      isClub: false,
    };
    const incoming: Boat = {
      id: 'new-2222',
      sailNumber: '1234',
      boatClass: 'laser',
      name: '',
      helm: 'Alice New',
      crew: '',
      isClub: false,
    };
    const result = pushRecentBoat([existing, boatB], incoming);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('new-2222');
    expect(result[1]).toEqual(boatB);
  });

  it('caps the list at maximum 5 items', () => {
    const b1: Boat = { ...boatA, id: 'b1', sailNumber: '1' };
    const b2: Boat = { ...boatA, id: 'b2', sailNumber: '2' };
    const b3: Boat = { ...boatA, id: 'b3', sailNumber: '3' };
    const b4: Boat = { ...boatA, id: 'b4', sailNumber: '4' };
    const b5: Boat = { ...boatA, id: 'b5', sailNumber: '5' };
    const b6: Boat = { ...boatA, id: 'b6', sailNumber: '6' };

    const initial = [b1, b2, b3, b4, b5];
    const result = pushRecentBoat(initial, b6);
    expect(result).toHaveLength(5);
    expect(result.map(b => b.id)).toEqual(['b6', 'b1', 'b2', 'b3', 'b4']);
  });
});
