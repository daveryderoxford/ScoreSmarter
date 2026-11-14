import {
  blankRaceCell,
  type SailwaveCompetitor,
  type SailwaveRaceCell,
  type SailwaveSeries,
  type SailwaveSummaryCaption,
} from './sailwave-series';

type ColumnRole =
  | 'rank'
  | 'sailNumber'
  | 'helm'
  | 'crew'
  | 'club'
  | 'boatClass'
  | 'boatName'
  | 'fleet'
  | 'rating'
  | 'race'
  | 'ignore';

const ROLE_BY_COL_CLASS: Record<string, ColumnRole> = {
  rank: 'rank',
  pos: 'rank',
  place: 'rank',
  sailno: 'sailNumber',
  sailnumber: 'sailNumber',
  altsailno: 'sailNumber',
  helmname: 'helm',
  helm: 'helm',
  skipper: 'helm',
  crewname: 'crew',
  crew: 'crew',
  club: 'club',
  class: 'boatClass',
  boatclass: 'boatClass',
  boat: 'boatName',
  boatname: 'boatName',
  fleet: 'fleet',
  division: 'fleet',
  rating: 'rating',
  py: 'rating',
  handicap: 'rating',
  race: 'race',
  total: 'ignore',
  nett: 'ignore',
  net: 'ignore',
  points: 'ignore',
  pts: 'ignore',
  elapsed: 'ignore',
  corrected: 'ignore',
  finish: 'ignore',
};

const HEADER_ROLES: { role: ColumnRole; pattern: RegExp }[] = [
  { role: 'rank', pattern: /^(pos(ition)?|place|rank)$/ },
  { role: 'boatClass', pattern: /^(class|boat class)$/ },
  { role: 'sailNumber', pattern: /^sail( no| num| number|num|no)?$/ },
  { role: 'helm', pattern: /^(helm( name)?|helmname|skipper|driver|helm owner)$/ },
  { role: 'crew', pattern: /^crew( name)?$/ },
  { role: 'club', pattern: /^club$/ },
  { role: 'rating', pattern: /^(py|pn|portsmouth( number)?|handicap|rating)$/ },
  { role: 'fleet', pattern: /^(fleet|division)$/ },
  { role: 'boatName', pattern: /^(boat( name)?|yacht)$/ },
  { role: 'ignore', pattern: /^(total|nett|net|pts|points|elapsed|el time|corrected|corr time|finish|fin time)$/ },
];

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const RACE_HEADER = new RegExp(
  `^(r\\d+|race \\d+|\\d{1,2} \\d{1,2}( \\d{2,4})?|\\d{1,2} (${MONTHS}))$`,
);
const RACE_TABLE_HEADER = /^(elapsed|el time|corrected|corr time|finish|fin time|laps|bce|start)$/;
const PUBLISHED = /as of\s+\d{1,2}[:.]\d{2}\s+on\s+([^<\n]*?\d{4})/i;
const NUMERIC_DATE = /(?<![\w/-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?![\w/-])/g;
const NAMED_DATE = new RegExp(`(?<![\\w])(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTHS})[a-z]*\\.?(?:[\\s,-]+(\\d{4}|\\d{2}))?(?![\\w])`, 'gi');
const YEAR = /\b(19|20)\d{2}\b/g;
const YEAR_RANGE = /\b((?:19|20)\d{2})\s*[/-]\s*(\d{2}|\d{4})\b/;
const SAILWAVE_TITLE = /^sailwave results for\s+(.+?)(?:\s+at\s+.+)?$/i;

interface PageContext {
  seriesName: string;
  published: string | null;
  titleYears: number[];
  yearRange: [number, number] | null;
  raceTitles: string[];
}

interface TableContext {
  seriesTitle: string | null;
  summaryTitle: string | null;
  summaryCaption: string | null;
  raceTitle: string | null;
}

/**
 * Reads Sailwave tables from a published HTML file. Summary tables are kept; race tables are kept only
 * when the page has no summary. Column identity comes from `<col class>` first, then the header text,
 * then the cell values.
 */
export function parseSailwaveHtml(html: string, sourceName = ''): SailwaveSeries[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return parseSailwaveDocument(document, sourceName);
}

export function parseSailwaveDocument(document: Document, sourceName = ''): SailwaveSeries[] {
  const page = pageContext(document);
  const tables = [...document.querySelectorAll('table')].filter(table => !table.querySelector('table'));
  const parsed = tables.flatMap((table, index) => {
    const series = parseTable(table, page, sourceName, index);
    return series ? [series] : [];
  });
  const summaries = parsed.filter(series => series.kind === 'series');
  return summaries.length > 0 ? summaries : parsed;
}

/** `Sailed: 12, Discards: 6, To count: 6, Rating system: PY, Entries: 42, Scoring system: Appendix A`. */
export function parseSummaryCaption(text: string): SailwaveSummaryCaption | null {
  const caption: SailwaveSummaryCaption = {
    sailed: null,
    discards: null,
    toCount: null,
    entries: null,
    ratingSystem: '',
    scoringSystem: '',
  };
  let found = false;
  for (const part of collapse(text).split(',')) {
    const match = part.match(/^\s*([a-z ]+?)\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];
    const count = /^\d+$/.test(value) ? Number(value) : null;
    if (key === 'sailed') caption.sailed = count;
    else if (key === 'discards') caption.discards = count;
    else if (key === 'to count') caption.toCount = count;
    else if (key === 'entries') caption.entries = count;
    else if (key === 'rating system') caption.ratingSystem = value;
    else if (key === 'scoring system') caption.scoringSystem = value;
    else continue;
    found = true;
  }
  return found ? caption : null;
}

/** A race-result cell. `(5.0)` is a discard. `12.0 DNC` keeps the code and the points. */
export function parseRaceCell(raw: string): SailwaveRaceCell {
  const text = collapse(raw);
  if (!text || text === '-' || text === '–') return blankRaceCell();
  const discarded = text.startsWith('(') && text.endsWith(')');
  const inner = discarded ? text.slice(1, -1).trim() : text;
  const scored = inner.match(/^(-?\d+(?:\.\d+)?)(?:\s+([A-Za-z]{2,6}))?$/);
  if (scored) {
    return {
      blank: false,
      discarded,
      points: Number(scored[1]),
      code: scored[2] ? scored[2].toUpperCase() : null,
    };
  }
  const codeOnly = inner.match(/^([A-Za-z]{2,6})$/);
  if (codeOnly) {
    return { blank: false, discarded, points: null, code: codeOnly[1].toUpperCase() };
  }
  return { blank: false, discarded, points: null, code: null };
}

function parseTable(
  table: HTMLTableElement,
  page: PageContext,
  sourceName: string,
  index: number,
): SailwaveSeries | null {
  const rows = tableRows(table);
  if (rows.length < 2) return null;
  const headerIndex = headerRowIndex(table);
  const header = rows[headerIndex] ?? [];
  const roles = columnRoles(table, header, rows.slice(headerIndex + 1));
  if (!roles.includes('sailNumber')) return null;
  if (!roles.includes('helm') && !roles.includes('boatClass')) return null;
  const context = tableContext(table);
  const kind = tableKind(table, context, header, roles);
  promoteLonePointsColumn(roles, header);

  const raceHeaders = header.filter((_, column) => roles[column] === 'race');
  const competitors: SailwaveCompetitor[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const competitor = competitorFromRow(row, roles, raceHeaders.length);
    if (competitor) competitors.push(competitor);
  }
  if (competitors.length === 0) return null;

  const seriesName = context.seriesTitle ?? page.seriesName;
  const fleetLabel = fleetLabelFor(table, context, kind, seriesName);
  const sailedHeaders = raceHeaders.filter((_, raceIndex) =>
    competitors.some(competitor => !competitor.races[raceIndex]?.blank));
  const raceTexts = kind === 'race'
    ? [context.raceTitle ?? '']
    : sailedHeaders.some(text => datesIn(text).length > 0) ? sailedHeaders : page.raceTitles;
  const lastRace = latestDate(raceTexts.flatMap(datesIn), page);
  const yearOnly = page.titleYears.length > 0 ? `${Math.max(...page.titleYears)}-07-01` : null;
  const date = lastRace ?? page.published ?? yearOnly;
  return {
    id: `${sourceName}#${index}`,
    title: fleetLabel ? `${seriesName} — ${fleetLabel}` : seriesName,
    seriesName,
    fleetLabel,
    sourceName,
    kind,
    caption: kind === 'series' && context.summaryCaption ? parseSummaryCaption(context.summaryCaption) : null,
    raceHeaders,
    competitors,
    hasRatingColumn: roles.includes('rating'),
    date,
    datePrecision: date == null ? null : (lastRace ?? page.published) ? 'day' : 'year',
  };
}

function tableKind(
  table: HTMLTableElement,
  context: TableContext,
  header: string[],
  roles: ColumnRole[],
): 'series' | 'race' {
  const classes = table.className.toLowerCase();
  if (classes.includes('summarytable')) return 'series';
  if (classes.includes('racetable')) return 'race';
  if (context.summaryCaption || context.summaryTitle) return 'series';
  if (context.raceTitle) return 'race';
  const raceColumns = roles.filter(role => role === 'race').length;
  const timed = header.some(text => RACE_TABLE_HEADER.test(normaliseHeader(text)));
  return timed && raceColumns < 2 ? 'race' : 'series';
}

/** Sailwave headings and captions above a table, up to the previous table. */
function tableContext(table: HTMLTableElement): TableContext {
  const context: TableContext = {
    seriesTitle: null,
    summaryTitle: null,
    summaryCaption: null,
    raceTitle: null,
  };
  let element: Element | null = table;
  for (let step = 0; step < 12 && element; step++) {
    const previous: Element | null = element.previousElementSibling;
    if (!previous) {
      element = element.parentElement;
      if (!element || element.tagName === 'BODY') break;
      continue;
    }
    element = previous;
    if (element.tagName === 'TABLE' || element.querySelector('table')) break;
    const classes = element.className.toString().toLowerCase();
    const text = collapse(element.textContent ?? '');
    if (!text) continue;
    if (classes.includes('summarycaption')) context.summaryCaption ??= text;
    else if (classes.includes('summarytitle')) context.summaryTitle ??= text;
    else if (classes.includes('racetitle')) context.raceTitle ??= text;
    else if (classes.includes('seriestitle')) {
      if (!PUBLISHED.test(text)) context.seriesTitle ??= text;
    } else if (!context.summaryCaption && /\bsailed\s*:\s*\d+/i.test(text)) context.summaryCaption = text;
  }
  if (!context.seriesTitle) context.seriesTitle = precedingSeriesTitle(table);
  return context;
}

function precedingSeriesTitle(table: HTMLTableElement): string | null {
  let found: string | null = null;
  for (const element of table.ownerDocument.querySelectorAll('.seriestitle')) {
    if (!(element.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    const text = collapse(element.textContent ?? '');
    if (text && !PUBLISHED.test(text)) found = text;
  }
  return found;
}

function pageContext(document: Document): PageContext {
  const titleText = collapse(document.querySelector('title')?.textContent ?? '');
  const sailwaveTitle = titleText.match(SAILWAVE_TITLE)?.[1] ?? '';
  const h1 = collapse(document.querySelector('h1')?.textContent ?? '');
  const seriesName = h1 || sailwaveTitle || titleText || 'Results';
  const seriesTitles = [...document.querySelectorAll('.seriestitle')].map(element => collapse(element.textContent ?? ''));
  const named = seriesTitles.find(text => !PUBLISHED.test(text)) ?? '';
  const yearSource = `${named} ${seriesName} ${titleText}`;
  const range = yearSource.match(YEAR_RANGE);
  const yearRange = range ? rangeYears(Number(range[1]), range[2]) : null;
  const years = new Set([...yearSource.matchAll(YEAR)].map(match => Number(match[0])));
  if (yearRange) years.add(yearRange[1]);
  const titleYears = [...years];
  const publishedText = [...seriesTitles, collapse(document.body?.textContent ?? '')]
    .map(text => text.match(PUBLISHED)?.[1] ?? '')
    .find(Boolean) ?? '';
  return {
    seriesName,
    published: publishedText ? namedDateIso(publishedText) : null,
    titleYears,
    yearRange,
    raceTitles: [...document.querySelectorAll('.racetitle')].map(element => collapse(element.textContent ?? '')),
  };
}

function rangeYears(start: number, endText: string): [number, number] | null {
  const end = endText.length === 2 ? Math.floor(start / 100) * 100 + Number(endText) : Number(endText);
  return end === start + 1 ? [start, end] : null;
}

interface DayMonth {
  day: number;
  month: number;
  year: number | null;
}

/** Day-month dates in UK order (`25-07`, `30/8/26`, `4 Oct 2025`). Times such as `11.00` are not dates. */
function datesIn(text: string): DayMonth[] {
  const found: DayMonth[] = [];
  for (const match of text.matchAll(NUMERIC_DATE)) {
    found.push({ day: Number(match[1]), month: Number(match[2]), year: fullYear(match[3]) });
  }
  for (const match of text.matchAll(NAMED_DATE)) {
    const month = MONTH_NAMES.indexOf(match[2].toLowerCase().slice(0, 3)) + 1;
    found.push({ day: Number(match[1]), month, year: fullYear(match[3]) });
  }
  return found.filter(date => date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31);
}

function fullYear(text: string | undefined): number | null {
  if (!text) return null;
  return text.length === 2 ? 2000 + Number(text) : Number(text);
}

/** The latest race date. A date without a year takes it from the publish date, else the title year. */
function latestDate(dates: DayMonth[], page: PageContext): string | null {
  let latest: string | null = null;
  for (const date of dates) {
    const year = date.year ?? yearFor(date, page);
    if (year == null) continue;
    const iso = isoDate(year, date.month, date.day);
    if (iso && (!latest || iso > latest)) latest = iso;
  }
  return latest;
}

function yearFor(date: DayMonth, page: PageContext): number | null {
  if (page.published) {
    const year = Number(page.published.slice(0, 4));
    const sameYear = isoDate(year, date.month, date.day);
    return sameYear && sameYear > page.published ? year - 1 : year;
  }
  if (page.yearRange) return date.month >= 7 ? page.yearRange[0] : page.yearRange[1];
  return page.titleYears.length === 1 ? page.titleYears[0] : null;
}

/** `August 16, 2026`, `Saturday, October 12, 2024`, or `16 August 2026`. */
function namedDateIso(text: string): string | null {
  const lower = text.toLowerCase();
  const monthIndex = MONTH_NAMES.findIndex(name => new RegExp(`\\b${name}`).test(lower));
  const year = lower.match(/\b(19|20)\d{2}\b/)?.[0];
  if (monthIndex < 0 || !year) return null;
  const day = lower.replace(year, '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/)?.[1];
  if (!day) return null;
  return isoDate(Number(year), monthIndex + 1, Number(day));
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function competitorFromRow(row: string[], roles: ColumnRole[], raceCount: number): SailwaveCompetitor | null {
  const read = (role: ColumnRole) => {
    const index = roles.indexOf(role);
    return index >= 0 ? collapse(row[index] ?? '') : '';
  };
  const sailNumber = read('sailNumber');
  const helm = read('helm');
  const boatClass = read('boatClass');
  if (!sailNumber || (!helm && !boatClass)) return null;

  const races: SailwaveRaceCell[] = [];
  roles.forEach((role, index) => {
    if (role === 'race') races.push(parseRaceCell(row[index] ?? ''));
  });
  while (races.length < raceCount) races.push(blankRaceCell());

  const ratingText = read('rating');
  const rating = /^-?\d+(?:\.\d+)?$/.test(ratingText) ? Number(ratingText) : null;
  return {
    sailNumber,
    helm,
    crew: read('crew'),
    club: read('club'),
    boatClass,
    boatName: read('boatName'),
    fleet: read('fleet'),
    rating,
    races: races.slice(0, raceCount),
  };
}

function columnRoles(table: HTMLTableElement, header: string[], body: string[][]): ColumnRole[] {
  const width = Math.max(header.length, ...body.map(row => row.length), 0);
  const classes = colClasses(table);
  const roles: ColumnRole[] = [];
  const used = new Set<ColumnRole>();
  for (let index = 0; index < width; index++) {
    const fromClass = ROLE_BY_COL_CLASS[classes[index] ?? ''];
    const fromHeader = headerRole(header[index] ?? '');
    let role: ColumnRole = fromClass ?? fromHeader ?? 'ignore';
    if (role !== 'race' && role !== 'ignore' && used.has(role)) {
      role = 'ignore';
    } else if (role === 'ignore' && !fromClass && !fromHeader) {
      role = heuristicRole(body.map(row => row[index] ?? ''), used) ?? 'ignore';
    }
    if (role !== 'race' && role !== 'ignore') used.add(role);
    roles.push(role);
  }
  return roles;
}

/** A one-race file often has a single Pts column instead of R1. That column is the race. */
function promoteLonePointsColumn(roles: ColumnRole[], header: string[]): void {
  if (roles.includes('race')) return;
  const index = roles.findIndex((role, column) =>
    role === 'ignore' && /^(pts|points)$/.test(normaliseHeader(header[column] ?? '')));
  if (index >= 0) roles[index] = 'race';
}

function headerRole(header: string): ColumnRole | null {
  const text = normaliseHeader(header);
  if (!text) return null;
  if (RACE_HEADER.test(text)) return 'race';
  return HEADER_ROLES.find(candidate => candidate.pattern.test(text))?.role ?? null;
}

function heuristicRole(cells: string[], used: Set<ColumnRole>): ColumnRole | null {
  const sample = cells.map(collapse).filter(text => text && text !== '-' && text !== '–').slice(0, 12);
  if (sample.length < 2) return null;
  const ratio = (test: (text: string) => boolean) => sample.filter(test).length / sample.length;
  if (ratio(text => {
    const cell = parseRaceCell(text);
    return !cell.blank && (cell.points != null || cell.code != null);
  }) >= 0.6) return 'race';
  if (!used.has('rating') && ratio(text => {
    const value = Number(text);
    return Number.isInteger(value) && value >= 500 && value <= 2000;
  }) >= 0.6) return 'rating';
  if (!used.has('sailNumber') && ratio(text => /^[A-Za-z]{0,3}\d[\w-]{0,8}$/.test(text)) >= 0.6) {
    return 'sailNumber';
  }
  if (!used.has('helm') && ratio(text => /[A-Za-z]/.test(text) && /\s/.test(text)) >= 0.6) return 'helm';
  return null;
}

function colClasses(table: HTMLTableElement): string[] {
  const classes: string[] = [];
  for (const column of table.querySelectorAll(':scope > colgroup > col')) {
    const span = Number(column.getAttribute('span') ?? '1') || 1;
    const name = (column.getAttribute('class') ?? '').toLowerCase().split(/\s+/).find(Boolean) ?? '';
    for (let index = 0; index < span; index++) classes.push(name);
  }
  return classes;
}

function tableRows(table: HTMLTableElement): string[][] {
  for (const lineBreak of table.querySelectorAll('br')) lineBreak.replaceWith(' ');
  return [...table.rows].map(row => {
    const cells: string[] = [];
    for (const cell of row.cells) {
      cells.push(collapse(cell.textContent ?? ''));
      for (let extra = 1; extra < cell.colSpan; extra++) cells.push('');
    }
    return cells;
  });
}

function headerRowIndex(table: HTMLTableElement): number {
  const rows = [...table.rows];
  const inHead = rows.findIndex(row => row.parentElement?.tagName === 'THEAD');
  if (inHead >= 0) return inHead;
  const withHeaderCell = rows.findIndex(row => row.querySelector('th'));
  return withHeaderCell >= 0 ? withHeaderCell : 0;
}

function fleetLabelFor(
  table: HTMLTableElement,
  context: TableContext,
  kind: 'series' | 'race',
  seriesName: string,
): string | null {
  const sailwave = kind === 'race' ? context.raceTitle : context.summaryTitle;
  if (sailwave && sailwave !== seriesName) return sailwave;
  const caption = collapse(table.caption?.textContent ?? '');
  if (caption && caption !== seriesName) return caption;
  const previous = table.previousElementSibling;
  if (!previous || !/^H[1-4]$/.test(previous.tagName)) return null;
  const text = collapse(previous.textContent ?? '');
  if (!text || text === seriesName) return null;
  return text;
}

function normaliseHeader(header: string): string {
  return collapse(header).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function collapse(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
