import { describe, expect, it } from 'vitest';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { Series } from 'app/race-calender';
import type { Race } from 'app/race-calender';
import type { HandicapConfiguration, LevelRatingConfiguration } from './scoring-configuration';
import {
  handicapSchemesRequiredForRaces,
  handicapSchemesRequiredForSeries,
  schemesRequiredAndSupportedByClub,
} from './handicap-race-requirements';

const testFleet: Fleet = { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' };

function levelRatingPrimary(): LevelRatingConfiguration {
  return {
    id: 'cfg-lr',
    name: 'LR',
    fleet: testFleet,
    type: 'LevelRating',
    handicapScheme: 'Level Rating',
  };
}

function pyPrimary(): HandicapConfiguration {
  return {
    id: 'cfg-py',
    name: 'PY',
    fleet: testFleet,
    type: 'Handicap',
    handicapScheme: 'PY',
  };
}

function ircSecondary(): HandicapConfiguration {
  return {
    id: 'cfg-irc',
    name: 'IRC',
    fleet: testFleet,
    type: 'Handicap',
    handicapScheme: 'IRC',
  };
}

function minimalSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 'series-1',
    seasonId: 'season-1',
    name: 'Test Series',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    initialDiscardAfter: 0,
    subsequentDiscardsEveryN: 999,
    primaryScoringConfiguration: pyPrimary(),
    ...overrides,
  } as Series;
}

describe('handicapSchemesRequiredForSeries', () => {
  it('includes Level Rating from LevelRating primary config', () => {
    const s = minimalSeries({ primaryScoringConfiguration: levelRatingPrimary() });
    expect(handicapSchemesRequiredForSeries(s)).toEqual(['Level Rating']);
  });

  it('includes primary Handicap scheme', () => {
    const s = minimalSeries({ primaryScoringConfiguration: pyPrimary() });
    expect(handicapSchemesRequiredForSeries(s)).toEqual(['PY']);
  });

  it('unions primary and secondary schemes', () => {
    const s = minimalSeries({
      primaryScoringConfiguration: pyPrimary(),
      secondaryScoringConfigurations: [ircSecondary(), levelRatingPrimary()],
    });
    expect(handicapSchemesRequiredForSeries(s).sort()).toEqual(
      ['IRC', 'Level Rating', 'PY'].sort()
    );
  });
});

describe('handicapSchemesRequiredForRaces', () => {
  it('returns empty when races is empty', () => {
    expect(handicapSchemesRequiredForRaces([], [])).toEqual([]);
  });

  it('unions schemes across races in different series', () => {
    const sPy = minimalSeries({
      id: 's-py',
      primaryScoringConfiguration: pyPrimary(),
    });
    const sLr = minimalSeries({
      id: 's-lr',
      primaryScoringConfiguration: levelRatingPrimary(),
    });
    const races: Race[] = [
      { id: 'r1', seriesId: 's-py' } as Race,
      { id: 'r2', seriesId: 's-lr' } as Race,
    ];
    const out = handicapSchemesRequiredForRaces(races, [sPy, sLr]);
    expect(out.sort()).toEqual(['Level Rating', 'PY'].sort());
  });
});

describe('schemesRequiredAndSupportedByClub', () => {
  it('returns required unchanged when supported is empty', () => {
    expect(schemesRequiredAndSupportedByClub(['PY', 'IRC'], undefined)).toEqual(['PY', 'IRC']);
    expect(schemesRequiredAndSupportedByClub(['PY', 'IRC'], [])).toEqual(['PY', 'IRC']);
  });

  it('filters to intersection when supported is non-empty', () => {
    expect(schemesRequiredAndSupportedByClub(['PY', 'IRC', 'Personal'], ['PY', 'Personal'])).toEqual([
      'PY',
      'Personal',
    ]);
  });
});
