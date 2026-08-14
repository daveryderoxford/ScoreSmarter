import { mergeClassAliases } from "./class-aliases.js";
import { ScannerContext } from "../ai-scan-model.js";
import type { ScannerRace } from "@shared/scanner-context";

function raceIds(ctx: ScannerContext): string[] {
  return (ctx.races ?? []).map((r) => r.id);
}

function entriesForRace(ctx: ScannerContext, raceId: string): string {
  const race = (ctx.races ?? []).find((r) => r.id === raceId);
  const entries = race?.entries ?? [];
  return entries.length > 0 ? JSON.stringify(entries) : "No entry list provided";
}

function formatRaceLabel(r: ScannerRace): string {
  const parts = [`id=${r.id}`];
  if (r.seriesName) parts.push(`series=${r.seriesName}`);
  if (typeof r.raceNumber === "number") parts.push(`raceNumber=${r.raceNumber}`);
  if (r.scheduledStartIso) parts.push(`scheduledStart=${r.scheduledStartIso}`);
  return parts.join(", ");
}

export function buildPrompt(ctx: ScannerContext, raceId: string): string {

  const aliasesStr = JSON.stringify(mergeClassAliases(ctx.classAliases));
  const ids = raceIds(ctx);
  const entryList = entriesForRace(ctx, raceId);
  const targetRacesStr = ids.length ? JSON.stringify(ids) : JSON.stringify([raceId]);

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
- CLASS_ALIASES maps sheet text → CLUB_CLASS_NAME: ${aliasesStr}
- When sheet text for a CLASS_ALIASE matches, always set boatClass.value to the CLUB_CLASS_NAME (the right-hand side of CLASS ALIASES).
-- Examples: Radial / Laser R / LR → ILCA 6; Laser / L → ILCA 7.
-- NEVER put sheet text (Radial, Laser R, LR, L, …) in boatClass.value when a CLASS_ALIASES matches.
- Use the ENTRY_LIST to determine matchedCompetitorId and to correct messy handwriting (e.g. '1234S' → '12345'); when corrected from ENTRY LIST, use HIGH confidence and set matchedCompetitorId to that entry's id.
-- ENTRY_LIST: ${entryList}

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
${specialInstructionsSection(ctx)}`;
}

function specialInstructionsSection(ctx: ScannerContext, sectionNumber = 4): string {
  const instructions = ctx.specialInstructions?.trim();
  if (!instructions) {
    return "";
  }
  return `
# ${sectionNumber}. SPECIAL INSTRUCTIONS
Apply these sheet-specific instructions in addition to the rules above. If they conflict with a rule, prefer these instructions for this scan:
${instructions}
`;
}

/**
 * Level-rating finish-order sheet prompt.
 * Uses `races[]` with per-race `entries`. Wording adapts for one vs many races.
 */
export function buildLevelRatingPrompt(ctx: ScannerContext): string {
  const aliasesStr = JSON.stringify(mergeClassAliases(ctx.classAliases));
  const races = ctx.races ?? [];
  const singleRace = races.length <= 1;
  const soleRace = races[0];
  const targetRacesStr = JSON.stringify(races.map((r) => r.id));

  let racesSection: string;
  let intro: string;
  let raceAssignmentRules: string;
  let positionRules: string;
  let entryListGuidance: string;

  if (singleRace) {
    racesSection = soleRace
      ? `Race: ${formatRaceLabel(soleRace)}\nENTRY_LIST: ${
        soleRace.entries.length > 0 ? JSON.stringify(soleRace.entries) : "No entry list provided"
      }`
      : "ENTRY_LIST: No entry list provided";
    intro = `You are reading a handwritten LEVEL RATING sailing results sheet for a single race.`;
    raceAssignmentRules = `- Set raceId to ${soleRace ? JSON.stringify(soleRace.id) : "the target race id"}.`;
    positionRules = `- Set position.value to the finishing place (integer, 1 = first).
- Derive places from sheet finish order AFTER applying linked-arrow swaps.
- Status codes (DNS, RET, OCS, BFD, DNF, DSQ, etc.): set status to that code; still emit the row; set position.value only if a place is clearly written, otherwise omit position or use MANUAL_CHECK.`;
    entryListGuidance = `- Use ENTRY_LIST to set matchedCompetitorId and correct messy handwriting; when corrected from ENTRY_LIST, use HIGH confidence.`;
  } else {
    const racesDetail = races.map((r) =>
      `- ${formatRaceLabel(r)}\n  ENTRY_LIST: ${
        r.entries.length > 0 ? JSON.stringify(r.entries) : "No entry list provided"
      }`,
    ).join("\n");
    racesSection = `Match each sheet row to exactly one of these races using that race's ENTRY_LIST:\n${racesDetail || "- (no races provided)"}`;
    intro = `You are reading a handwritten LEVEL RATING sailing results sheet that may cover MULTIPLE races.`;
    raceAssignmentRules = `- Set raceId to one of the target race ids above.
- Choose the race whose ENTRY_LIST contains the matched competitor (class + sail). If ambiguous, set overallRowConfidence to MANUAL_CHECK and prefer the race with the strongest unique sail match.`;
    positionRules = `- Set position.value to the finishing place for that competitor in their race (integer, 1 = first).
- Derive places from sheet finish order AFTER applying linked-arrow swaps, counting separately within each raceId.
- Status codes (DNS, RET, OCS, BFD, DNF, DSQ, etc.): set status to that code; still emit the row; set position.value only if a place is clearly written, otherwise omit position or use MANUAL_CHECK.`;
    entryListGuidance = `- Use the matching race's ENTRY_LIST to set matchedCompetitorId and correct messy handwriting; when corrected from ENTRY_LIST, use HIGH confidence.`;
  }

  return `
${intro}
Follow these rules exactly. ACCURACY is preferred to COMPLETENESS.
Respond with raw JSON only (no markdown).
Target race ids for this scan: ${targetRacesStr}.

# 1. SELECTED RACES
${racesSection}

# 2. ROW HANDLING
- The sheet lists competitors in FINISH ORDER (top to bottom)${singleRace ? "" : ", not grouped by race"}.
- Emit EVERY data row present.
- Crossed-out rows: ignore struck-through / heavily scribbled rows, or emit status STRUCK_THROUGH with FAILED confidence.
- Linked arrows between rows mean those competitors' finish order is SWAPPED relative to their written vertical order. Apply swaps when assigning positions.
- Row integrity: extract strictly row-by-row. Never shift class/sail vertically between rows.

# 3. COLUMN DEFINITIONS

## Row index
- First column is a typewritten integer row index.
- Copy that number into rowIndex for each emitted row.

## Class / sail number
- Read class and sail number from the same row.
- CLASS_ALIASES maps sheet text → CLUB_CLASS_NAME: ${aliasesStr}
- When sheet text matches a CLASS_ALIAS, always set boatClass.value to the CLUB_CLASS_NAME.
-- Examples: Radial / Laser R / LR → ILCA 6; Laser / L → ILCA 7.
- Sail numbers on the sheet may be the FULL sail number OR only the last N trailing digits. Infer N from how the race officer wrote sails on this sheet (consistency across rows) and from uniqueness against ENTRY_LIST sails. Match to ENTRY_LIST accordingly.
${entryListGuidance}

## Race assignment
${raceAssignmentRules}

## Position (position-in-class / finish place)
${positionRules}

## Name (optional)
- Read competitor name when present; omit if absent.

# 4. CONFIDENCE + PAGE NOTES
- If unsure of a value, report alternatives.
- Per-field and overallRowConfidence: HIGH | MANUAL_CHECK | FAILED | AMBIGUOUS.
- HIGH: certain read, especially exact ENTRY LIST match.
- MANUAL_CHECK: unclear handwriting,${singleRace ? "" : " ambiguous race assignment,"} or uncertain position after arrow swaps.
- FAILED / AMBIGUOUS: not readable. Use FAILED for completely unreadable scribbles.
- Large multi-row notes go in pageNotes, not competitor rows.
${specialInstructionsSection(ctx, 5)}`;
}
