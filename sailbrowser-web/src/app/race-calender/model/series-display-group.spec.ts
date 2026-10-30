import { describe, expect, it } from 'vitest';
import { displayGroupSuggestions, distinctDisplayGroups } from './series-display-group';

describe('series display groups', () => {
  it('lists distinct groups, sorted and trimmed, ignoring series without one', () => {
    const series = [{ displayGroup: 'Opens' }, { displayGroup: ' Cups ' }, {}, { displayGroup: 'Opens' }, { displayGroup: '' }];
    expect(distinctDisplayGroups(series)).toEqual(['Cups', 'Opens']);
  });

  it('suggests groups containing what is typed, excluding an exact match', () => {
    const groups = ['Cups', 'General', 'Opens'];
    expect(displayGroupSuggestions(groups, '')).toEqual(groups);
    expect(displayGroupSuggestions(groups, 'en')).toEqual(['General', 'Opens']);
    expect(displayGroupSuggestions(groups, 'opens')).toEqual([]);
  });
});
