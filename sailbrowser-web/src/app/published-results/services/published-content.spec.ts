import { Timestamp } from '@angular/fire/firestore';
import { toAppModel, toDbModel } from 'app/shared/firebase/firestore-helper';
import { describe, expect, it } from 'vitest';
import { samePublishedContent } from './published-content';

/** What reading a document back gives, after the app's converter wrote it. */
function storedCopy<T extends { id: string }>(doc: T): T {
  return { ...toAppModel<T>(toDbModel(doc, false, true)), id: doc.id };
}

describe('samePublishedContent', () => {
  const start = new Date('2026-06-06T13:00:00Z');

  it('treats dates and timestamps for the same instant as equal', () => {
    expect(samePublishedContent({ start }, { start: Timestamp.fromDate(start) })).toBe(true);
    expect(samePublishedContent({ start }, { start: new Date(start.getTime() + 1000) })).toBe(false);
  });

  it('ignores key order and missing, null or undefined optional fields', () => {
    expect(samePublishedContent({ a: 1, b: undefined, c: null }, { a: 1 })).toBe(true);
    expect(samePublishedContent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('detects changed values in nested results', () => {
    const race = { id: 'r1', results: [{ helm: 'Sam', points: 3, start }] };
    expect(samePublishedContent(race, structuredClone(race))).toBe(true);
    expect(samePublishedContent(race, { ...race, results: [{ helm: 'Sam', points: 4, start }] })).toBe(false);
  });

  it('sees a race as unchanged after a round trip through the Firestore converter', () => {
    const race = {
      id: 'r1',
      seriesId: 's1',
      scheduledStart: start,
      raceOfficer: undefined,
      results: [
        { helm: 'Sam', crew: undefined, points: 1, finishTime: start, divisions: [] },
        { helm: 'Alex', crew: 'Jo', points: 2.5, finishTime: undefined, divisions: ['juniors'] },
      ],
      divisionDefinitions: [],
    };

    expect(samePublishedContent(race, storedCopy(race))).toBe(true);
    expect(samePublishedContent({ ...race, results: [race.results[1], race.results[0]] }, storedCopy(race))).toBe(false);
  });

  it('detects added or removed results and array order changes', () => {
    expect(samePublishedContent({ results: [1, 2] }, { results: [1] })).toBe(false);
    expect(samePublishedContent({ results: [1, 2] }, { results: [2, 1] })).toBe(false);
  });
});
