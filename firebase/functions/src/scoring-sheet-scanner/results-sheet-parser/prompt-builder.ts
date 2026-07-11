import { mergeClassAliases } from "./class-aliases.js";
import { ScannerContext } from "../ai-scan-model.js";

export function buildPrompt(ctx: ScannerContext, raceId: string): string {

  const aliasesStr = JSON.stringify(mergeClassAliases(ctx.classAliases));
  const entryList = ctx.roster && ctx.roster.length > 0 ? JSON.stringify(ctx.roster) : "No entry list provided";
  const targetRacesStr = ctx.targetRaces?.length ? JSON.stringify(ctx.targetRaces) : JSON.stringify([raceId]);

  const lapsPresent = ctx.lapsPresentOnSheet !== false;

  const timeFormat = ctx.timeFormat ?? "clock_hms";

  let lapColumnRules = `Laps column: ABSENT on this sheet. Set laps to 1 for every row.`;
  if (lapsPresent) {
    lapColumnRules = `Laps column: PRESENT — numeric.
- Read integer lap counts only (1, 2, 3, ...).
- If a row has no lap value, default to ${ctx.defaultLaps ?? 1}.`;
  }

  let timeColumnRules = `Time column: CLOCK TIME (H:M:S).
- Read real clock times as hours, minutes, seconds.
- If only MM:SS is present: estimate hour from adjacent rows; if that is unclear use defaultHour=${ctx.defaultHour ?? "unknown"}.
-- This is the ONLY allowed use of data from another row.
- Minutes/seconds must be 0-59; provide alternatives when ambiguous.
- Output time.value = { "hours": number, "minutes": number, "seconds": number }.
- For non-finish/status rows use placeholder { "hours": 0, "minutes": 0, "seconds": 0 }.`;
  if (timeFormat === "stopwatch_hms_elapsed") {
    timeColumnRules = `Time column: STOPWATCH ELAPSED WITH HOURS (H:MM:SS).
- Durations, not wall-clock time.
- Sub-hour times are MM:SS → set hours = 0.
- Minutes/seconds must be 0-59; provide alternatives when ambiguous.
- Output time.value = { "hours": number, "minutes": number, "seconds": number }.
- For non-finish/status rows use placeholder { "hours": 0, "minutes": 0, "seconds": 0 }.`;
  } else if (timeFormat === "stopwatch_ms_elapsed") {
    timeColumnRules = `Time column: STOPWATCH ELAPSED MINUTES/SECONDS (MM:SS).
- Durations, not wall-clock time.
- elapsedMinutes may be any non-negative integer; seconds must be 0-59.
- Output time.value = { "elapsedMinutes": number, "seconds": number }.
- For non-finish/status rows use placeholder { "elapsedMinutes": 0, "seconds": 0 }.`;
  }

  let orderExpectation = `Order: UNSORTED — evaluate each row independently; do not rely on sequence.`;
  if (ctx.listOrder === "chronological") {
    orderExpectation = `Order: CHRONOLOGICAL — times should generally increase down the sheet. Use this to catch OCR errors; flag drastic breaks as MANUAL_CHECK and/or provide alternatives.`;
  } else if (ctx.listOrder === "firstLap") {
    orderExpectation = `Order: FIRST LAP — times generally increase, but overtakes/laps can make order approximate. Flag drastic breaks as MANUAL_CHECK and/or provide alternatives.`;
  }

  return `
You are reading a handwritten sailing race results sheet for a HANDICAP race. 
Follow these rules exactly. ACCURACY is prefered to COMPLETNESS.
Respond with raw JSON only (no markdown).
Target race id: ${raceId}. Target races in this scan: ${targetRacesStr}.

# 1. ROW HANDLING
- Emit EVERY data row present, including rows with a blank time cell.
- Crossed-out rows: Ignore struck-through / heavily scribbled rows, or emit status STRUCK_THROUGH with FAILED confidence. If a time is crossed out and rewritten, take the new time.
- Row integrity: 
-- extract strictly row-by-row. Never shift data vertically. Never take a competitor's time from a different row than their class/sail number.
-- Hour exception (clock mode only): if the hour field is blank but MM:SS is present, you MAY estimate hour from adjacent rows (see Time column). Do not copy minutes or seconds from another row.
- ${orderExpectation}

# 2. COLUMN DEFINITIONS

## Row index
- First column is a typewritten integer row index.
- Copy that number into rowIndex for each emitted row.

## Class / sail number
- Read class and sail number from the same row.

- Use the 'ENTRY LIST' to determine the matchedCompetitorId 
-- Use the ENTRY LIST to CIRRECT messy handwriting (e.g. '1234S' → '12345'); when corrected from ENTRY LIST, use HIGH confidence and set matchedCompetitorId to that entry's id.
-- ENTRY LIST:  (Firestore race-results ids): ${entryList}

- Map class names using 'CLASS ALIASES' 
-- (e.g. 'Laser R' → 'ILCA 6') for boatClass and ENTRY LIST matching.
-- CLASS ALIASES list: ${aliasesStr}

## Time
${timeColumnRules}
- Status codes in the time column (DNS, RET, OCS, BFD, DNF, DSQ, etc.): set status to that code and use the placeholder time.value.
- Blank/missing time (no status code): still emit the row; set status to "NOT FINISHED", overallRowConfidence to MANUAL_CHECK, and use the placeholder time.value.

## Laps
${lapColumnRules}
- If DITTO marks are written use lap value from the row above

## Name (optional)
- Read competitor name when present; omit if absent.

# 3. CONFIDENCE + PAGE NOTES
- If you are unsure of a value report any alternatives that the vakue could be. 
- Per-field and overallRowConfidence: HIGH | MANUAL_CHECK | FAILED | AMBIGUOUS.
- HIGH: certain read, especially exact ENTRY LIST match.
- MANUAL_CHECK: unclear handwriting, ENTRY LIST correction, out-of-sequence time, or blank time.
- FAILED / AMBIGUOUS: not readable or decipherable. Only add alternatives if you have a guess. Use FAILED for completely unreadable scribbles.
- Large multi-row notes (e.g. "RACE ABANDONED") go in pageNotes, not competitor rows.
`;
}
