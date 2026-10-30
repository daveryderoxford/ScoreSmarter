import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calender/model/race';
import { racesToLinkToSheet } from './sheet-capture.store';

const race = (id: string, resultsSheetImage: string) => ({ id, resultsSheetImage }) as Race;

describe('racesToLinkToSheet', () => {
  it('links every selected race not already pointing at the sheet image', () => {
    const path = 'clubs/ibrsc/results-sheets/scan-img-lr1.jpg';
    const races = [race('lr1', path), race('lr2', ''), race('lr3', 'clubs/ibrsc/results-sheets/scan-img-old.jpg')];
    expect(racesToLinkToSheet(races, path).map(r => r.id)).toEqual(['lr2', 'lr3']);
  });

  it('links nothing when every race already has the image', () => {
    expect(racesToLinkToSheet([race('h1', 'a.jpg')], 'a.jpg')).toEqual([]);
  });
});
