import { describe, expect, it } from 'vitest';
import { parseRaceCell, parseSailwaveHtml, parseSummaryCaption } from './parse-sailwave-html';
import { describeSeries, sailedRaceCount, seriesAge } from './sailwave-series';

const SUMMARY_COLS = `
  <colgroup>
    <col class="rank"><col class="class"><col class="sailno"><col class="helmname">
    <col class="rating"><col class="race"><col class="race"><col class="race"><col class="nett">
  </colgroup>`;

const RACE_COLS = `
  <colgroup>
    <col class="rank"><col class="helmname"><col class="class"><col class="sailno">
    <col class="rating"><col class="elapsed"><col class="corrected"><col class="points">
  </colgroup>`;

/** Sailwave's standard page, as Northampton publishes it on sailwave.com. */
const NORTHAMPTON_HTML = `
  <html><head><title>Sailwave results for 2026 Late Summer Sunday Series at Northampton Sailing Club 2026</title></head>
  <body>
  <h1>2026 Late Summer Sunday Series</h1>
  <h2>Northampton Sailing Club</h2>
  <h3 class="seriestitle">Results are provisional as of 16:51 on August 16, 2026</h3>
  <h3 class="summarytitle">Overall</h3>
  <div class="caption summarycaption">Sailed: 2, Discards: 0, To count: 2, Rating system: PY, Entries: 2, Scoring system: Appendix A</div>
  <table class="summarytable">${SUMMARY_COLS}
    <thead><tr class="titlerow"><th>Rank</th><th>Class</th><th>SailNo</th><th>HelmName</th><th>PY</th>
      <th>R1<br />05/07</th><th>R2<br />12/07</th><th>R3<br />19/07</th><th>Nett</th></tr></thead>
    <tbody>
      <tr><td>1st</td><td>Solo</td><td>5693</td><td>Ann Helm</td><td>1142</td><td>1.0</td><td>1.0</td><td></td><td>2.0</td></tr>
      <tr><td>2nd</td><td>ILCA 7</td><td>214502</td><td>Bea Helm</td><td>1100</td><td>2.0</td><td>2.0</td><td></td><td>4.0</td></tr>
    </tbody>
  </table>
  <h3 class="racetitle" id="r1">R1 05/07</h3>
  <div class="caption racecaption">Start: Start 1, Finishes: Finish time</div>
  <table class="racetable">${RACE_COLS}
    <thead><tr class="titlerow"><th>Rank</th><th>HelmName</th><th>Class</th><th>SailNo</th><th>PY</th><th>Elapsed</th><th>Corrected</th><th>Points</th></tr></thead>
    <tbody><tr><td>1</td><td>Ann Helm</td><td>Solo</td><td>5693</td><td>1142</td><td>0:40:00</td><td>0:35:01</td><td>1.0</td></tr></tbody>
  </table>
  </body></html>
`;

/** Papercourt wraps Sailwave in its own site: the series name is the seriestitle, one summary per fleet. */
const PAPERCOURT_HTML = `
  <html><head><title>2026 SUMMER SATURDAY GH - results</title></head><body>
  <h1>2026 SUMMER SATURDAY GH</h1>
  <div id="wrap">
  <h2>Papercourt</h2>
  <div style="clear:both"></div>
  <h3 class="seriestitle">2026 SUMMER SAT GH</h3>
  <h3 class="summarytitle" id="summaryfast">Fast Fleet</h3>
  <div class="caption summarycaption">Sailed: 3, Discards: 1, To count: 2, Rating system: PY, Entries: 2, Scoring system: Appendix A</div>
  <table class="summarytable">${SUMMARY_COLS}
    <thead><tr class="titlerow"><th>Rank</th><th>Class</th><th>SailNo</th><th>HelmName</th><th>PY</th>
      <th><a class="racelink" href="#r1fast">25-07</a></th><th>01-08</th><th>24-10</th><th>Nett</th></tr></thead>
    <tbody><tr><td>1st</td><td>RS400</td><td>1450</td><td>Cal Helm</td><td>942</td><td>1.0</td><td>(3.0)</td><td>2.0</td><td>3.0</td></tr></tbody>
  </table>
  <h3 class="summarytitle" id="summaryslow">Slow Fleet</h3>
  <div class="caption summarycaption">Sailed: 3, Discards: 1, To count: 2, Rating system: PY, Entries: 1, Scoring system: Appendix A</div>
  <table class="summarytable">${SUMMARY_COLS}
    <thead><tr class="titlerow"><th>Rank</th><th>Class</th><th>SailNo</th><th>HelmName</th><th>PY</th><th>25-07</th><th>01-08</th><th>24-10</th><th>Nett</th></tr></thead>
    <tbody><tr><td>1st</td><td>Solo</td><td>5401</td><td>Dee Helm</td><td>1142</td><td>1.0</td><td>(2.0)</td><td>1.0</td><td>2.0</td></tr></tbody>
  </table>
  </div>
  </body></html>
`;

const RACES_ONLY_HTML = `
  <html><head><title>Sailwave results for Club Regatta at Northampton Sailing Club 2025</title></head><body>
  <h1>Club Regatta</h1>
  <h3 class="racetitle" id="r1">Race 1 - 14/6/25</h3>
  <table class="racetable">${RACE_COLS}
    <thead><tr><th>Rank</th><th>HelmName</th><th>Class</th><th>SailNo</th><th>PY</th><th>Elapsed</th><th>Corrected</th><th>Points</th></tr></thead>
    <tbody><tr><td>1</td><td>Eve Helm</td><td>Solo</td><td>5400</td><td>1142</td><td>0:40:00</td><td>0:35:01</td><td>1.0</td></tr></tbody>
  </table>
  </body></html>
`;

const COL_CLASS_HTML = `
  <html><head><title>Spring Series</title></head><body>
  <h1>Spring Series</h1>
  <table>
    <colgroup>
      <col class="rank" />
      <col class="class" />
      <col class="sailno" />
      <col class="helmname" />
      <col class="crewname" />
      <col class="rating" />
      <col class="race" /><col class="race" /><col class="race" />
      <col class="total" /><col class="nett" />
    </colgroup>
    <thead><tr class="titlerow">
      <th>Rank</th><th>Class</th><th>SailNo</th><th>HelmName</th><th>CrewName</th><th>PY</th>
      <th>R1</th><th>R2</th><th>R3</th><th>Total</th><th>Nett</th>
    </tr></thead>
    <tbody>
      <tr><td>1</td><td>ILCA 7</td><td>214502</td><td>Ann Helm</td><td>Bea Crew</td><td>1100</td>
        <td>1.0</td><td>(2.0)</td><td>3.0</td><td>6.0</td><td>4.0</td></tr>
      <tr><td>2</td><td>ILCA 6</td><td>1402</td><td>Cara Helm</td><td></td><td>1147</td>
        <td>(4.0 DNC)</td><td>1.0</td><td>2.0</td><td>7.0</td><td>3.0</td></tr>
    </tbody>
  </table>
  </body></html>
`;

const ALIAS_HTML = `
  <html><body><h1>Rutland Sunday</h1>
  <table>
    <tr><th>Pos</th><th>Fleet</th><th>Class</th><th>Sail No</th><th>Helm</th><th>Club</th><th>PY</th><th>Pts</th></tr>
    <tr><td>1</td><td>Fast</td><td>RS400</td><td>1450</td><td>Dan Helm</td><td>Rutland</td><td>942</td><td>1.0</td></tr>
  </table>
  </body></html>
`;

const DATE_HEADER_HTML = `
  <html><body><h2>Autumn</h2>
  <table>
    <tr><th>Rank</th><th>Class</th><th>Sail Number</th><th>Helm</th><th>Crew</th><th>PY</th><th>04-Oct</th><th>11-Oct</th><th>Nett</th></tr>
    <tr><td>1</td><td>Solo</td><td>5400</td><td>Eve Helm</td><td></td><td>1142</td><td>2.0</td><td>(15.0 DNC)</td><td>2.0</td></tr>
    <tr><td>2</td><td>Solo</td><td>5401</td><td>Fay Helm</td><td></td><td>1142</td><td>1.0</td><td>2.0</td><td>3.0</td></tr>
  </table>
  </body></html>
`;

describe('parseSailwaveHtml', () => {
  it('reads competitor fields from col classes and keeps discarded scores', () => {
    const [series] = parseSailwaveHtml(COL_CLASS_HTML, 'spring.htm');
    expect(series.title).toBe('Spring Series');
    expect(series.hasRatingColumn).toBe(true);
    expect(series.raceHeaders).toEqual(['R1', 'R2', 'R3']);
    expect(series.competitors[0]).toMatchObject({
      sailNumber: '214502',
      helm: 'Ann Helm',
      crew: 'Bea Crew',
      boatClass: 'ILCA 7',
      rating: 1100,
    });
    expect(series.competitors[0].races[1]).toMatchObject({ points: 2, discarded: true, code: null });
    expect(series.competitors[1].races[0]).toMatchObject({ points: 4, discarded: true, code: 'DNC' });
  });

  it('maps header aliases when the table has no col classes', () => {
    const [series] = parseSailwaveHtml(ALIAS_HTML);
    expect(series.competitors[0]).toMatchObject({
      sailNumber: '1450',
      helm: 'Dan Helm',
      club: 'Rutland',
      boatClass: 'RS400',
      fleet: 'Fast',
      rating: 942,
    });
    expect(series.raceHeaders).toEqual(['Pts']);
    expect(series.competitors[0].races[0]).toMatchObject({ points: 1, code: null });
  });

  it('treats date headers whose cells are scores as race columns', () => {
    const [series] = parseSailwaveHtml(DATE_HEADER_HTML);
    expect(series.raceHeaders).toEqual(['04-Oct', '11-Oct']);
    expect(series.competitors[0].races[1]).toMatchObject({ points: 15, code: 'DNC', discarded: true });
  });

  it('reads the series name, fleet, caption, and last race from a standard Sailwave page and skips its race tables', () => {
    const found = parseSailwaveHtml(NORTHAMPTON_HTML, 'late-summer.htm');
    expect(found).toHaveLength(1);
    const [series] = found;
    expect(series).toMatchObject({
      kind: 'series',
      seriesName: '2026 Late Summer Sunday Series',
      fleetLabel: 'Overall',
      title: '2026 Late Summer Sunday Series — Overall',
      date: '2026-07-12',
      datePrecision: 'day',
    });
    expect(series.caption).toEqual({
      sailed: 2,
      discards: 0,
      toCount: 2,
      entries: 2,
      ratingSystem: 'PY',
      scoringSystem: 'Appendix A',
    });
    expect(sailedRaceCount(series)).toBe(2);
  });

  it('takes the series name from seriestitle and one summary per fleet when the page is wrapped by a club site', () => {
    const found = parseSailwaveHtml(PAPERCOURT_HTML, 'summer-gh');
    expect(found.map(series => series.title)).toEqual([
      '2026 SUMMER SAT GH — Fast Fleet',
      '2026 SUMMER SAT GH — Slow Fleet',
    ]);
    expect(found[1].caption).toMatchObject({ sailed: 3, discards: 1, toCount: 2, entries: 1 });
    expect(found[0].date).toBe('2026-10-24');
  });

  it('uses race tables when the page has no summary', () => {
    const [race] = parseSailwaveHtml(RACES_ONLY_HTML, 'regatta.htm');
    expect(race).toMatchObject({ kind: 'race', title: 'Club Regatta — Race 1 - 14/6/25', date: '2025-06-14', caption: null });
    expect(race.competitors[0]).toMatchObject({ helm: 'Eve Helm', boatClass: 'Solo' });
  });
});

describe('parseSummaryCaption', () => {
  it('reads the counts and leaves out unknown parts', () => {
    expect(parseSummaryCaption('Sailed: 12, Discards: 6, To count: 6, Rating system: PY, Entries: 42, Scoring system: Appendix A'))
      .toEqual({ sailed: 12, discards: 6, toCount: 6, entries: 42, ratingSystem: 'PY', scoringSystem: 'Appendix A' });
    expect(parseSummaryCaption('Start: Start 1, Finishes: Place')).toBeNull();
  });
});

describe('series age', () => {
  it('keeps series from the last two years and reports undated ones', () => {
    const today = new Date(2026, 10, 8);
    const [series] = parseSailwaveHtml(NORTHAMPTON_HTML);
    expect(seriesAge(series, today)).toBe('recent');
    expect(seriesAge({ ...series, date: '2024-11-07' }, today)).toBe('old');
    expect(seriesAge({ ...series, date: null }, today)).toBe('undated');
    expect(describeSeries(series)).toBe('2 entries. Sailed 2, discards 0, to count 2. 12 Jul 2026.');
  });
});

describe('parseRaceCell', () => {
  it('reads a bare score, a discard, and a blank', () => {
    expect(parseRaceCell('2.0')).toMatchObject({ points: 2, discarded: false, blank: false });
    expect(parseRaceCell('(5.0)')).toMatchObject({ points: 5, discarded: true, code: null });
    expect(parseRaceCell('')).toMatchObject({ blank: true });
    expect(parseRaceCell('DNC')).toMatchObject({ code: 'DNC', points: null, blank: false });
  });
});
