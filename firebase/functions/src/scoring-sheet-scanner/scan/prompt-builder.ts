import { defaultClassAliases } from "./class-aliases.js";
import { ScannerContext } from "../ai-scan-types.js";

export function buildPrompt(ctx: ScannerContext, raceId: string): string {

  const aliasesStr = ctx.classAliases ? JSON.stringify(ctx.classAliases) : JSON.stringify(defaultClassAliases);
  const roster = ctx.roster && ctx.roster.length > 0 ? JSON.stringify(ctx.roster) : "No entry list provided";
  const targetRacesStr = ctx.targetRaces?.length ? JSON.stringify(ctx.targetRaces) : JSON.stringify([raceId]);

  const lapsPresent = ctx.lapsPresentOnSheet !== false;

  const timeFormat = ctx.timeFormat ?? "clock_hms";
  let timeInterpretationMode = "Clock H:M:S (real time)";
  if (timeFormat === "stopwatch_hms_elapsed") {
    timeInterpretationMode = "Stopwatch elapsed H:MM:SS";
  } else if (timeFormat === "stopwatch_ms_elapsed") {
    timeInterpretationMode = "Stopwatch elapsed MM:SS";
  }

  let lapRules = `4. NO LAP COLUMN ON THIS SHEET:
  The race officer did not record laps on this sheet. Set laps to a default of 1.`
  if (lapsPresent && ctx.lapFormat === "ticks") {
    lapRules = `4. LAP COLUMN PRESENT — TICKS/TALLIES FORMAT:
  - Interpret lap marks as tallies/checkmarks (e.g., ||| = 3, VV = 2). If both tallies and a final number are present, use the final number.
  - When no lap value is visible in a row default to a value of ${ctx.defaultLaps ?? "Unknown"}`;
  } else if (lapsPresent) {
    lapRules = `4. LAP COLUMN PRESENT — NUMERIC FORMAT:
  - Read lap counts only as integer numbers (1, 2, 3, ...).
  - Ignore tally/checkmark interpretation in this mode.
  - If no laps are written in a row default to ${ctx.defaultLaps ?? "Unknown"}`;
  }

  let timeRules = `5. TIME FORMAT — CLOCK TIME (H:M:S):
  - Read times as real clock times with hours, minutes, and seconds (H:MM:SS).
  - A two-part value may be written as MM:SS when hour is omitted.
  - If only 2 fields are present:
  -- consider the hour field is missing 
  -- Use hour value in adjacent rows to estimate it or use default value of ${ctx.defaultHour ?? "Unknown"}.  
  - Preserve clock semantics; do not reinterpret this mode as pure elapsed stopwatch mode.
  - Ensure minutes and seconds are 0-59; provide alternatives when ambiguous.`;
  if (timeFormat === "stopwatch_hms_elapsed") {
    timeRules = `5. TIME FORMAT — STOPWATCH ELAPSED WITH HOURS (H:MM:SS):
  - Times are recorded as stopwatch durations, NOT wall-clock time.
  - Times less than 1 hour will have minutes, seconds fields
  - Times greater than hour will have hour, minute, second field.
  - If only MM:SS is present, treat it as sub-hour elapsed and set hours = 0.
  - Ensure minutes/seconds are 0-59 and provide alternatives when ambiguous.`;
  } else if (timeFormat === "stopwatch_ms_elapsed") {
    timeRules = `5. TIME FORMAT — STOPWATCH ELAPSED MINUTES/SECONDS (MM:SS):
  - Times are recorded as stopwatch durations, NOT wall-clock time.
  - All times will be recorded as elapsed minutes, seconds
  -- Minutes may have any non-negative integer.
  -- Ensure seconds are in the range 0-59. Provide alternatives when ambiguous.
`;
  }

  let orderExpectation = `6. ORDER EXPECTATION — UNSORTED:
   - Do not rely on ordering; evaluate each row independently.`;
  if (ctx.listOrder === "chronological") {
    orderExpectation = `6. ORDER EXPECTATION — CHRONOLOGICAL:
   - Times should generally strictly increase as you read down.`;
  } else if (ctx.listOrder === "firstLap") {
    orderExpectation = `6. ORDER EXPECTATION — FIRST LAP:
   - Times generally increase, but overtakes/laps can make ordering approximate, especially with mixed lap counts.`;
  }

  let outputTimeStructure = `
  9. OUTPUT TIME STRUCTURE (REQUIRED):
   This sheet uses clock time (H:M:S), so output only:
   - time.value = { "hours": number, "minutes": number, "seconds": number }.
   Use numeric fields only:
   - minutes/seconds must be in the range 0-59.
   For non-finish/status rows (DNS, DNF, RET, DSQ, etc.), return placeholder:
   - { "hours": 0, "minutes": 0, "seconds": 0 }`;
  if (timeFormat === "stopwatch_ms_elapsed") {
    outputTimeStructure = `
  9. OUTPUT TIME STRUCTURE (REQUIRED):
   This sheet uses stopwatch elapsed minutes/seconds (MM:SS), so output only:
   - time.value = { "elapsedMinutes": number, "seconds": number }.
   Use numeric fields only:
   - elapsedMinutes can be any non-negative integer.
   - seconds must be in the range 0-59.
   For non-finish/status rows (DNS, DNF, RET, DSQ, etc.), return placeholder:
   - { "elapsedMinutes": 0, "seconds": 0 }`;
  } else if (timeFormat === "stopwatch_hms_elapsed") {
    outputTimeStructure = `
  9. OUTPUT TIME STRUCTURE (REQUIRED):
   This sheet uses stopwatch elapsed with hours (H:MM:SS), so output only:
   - time.value = { "hours": number, "minutes": number, "seconds": number }.
   Use numeric fields only:
   - minutes/seconds must be in the range 0-59.
   For non-finish/status rows (DNS, DNF, RET, DSQ, etc.), return placeholder:
   - { "hours": 0, "minutes": 0, "seconds": 0 }`;
  }

  return `
- You are reading a handwritten race results sheet for a sailing race. 
- You must follow these strict rules to maximize accuracy and provide structured output.
- Ensuring results are recorded accurately is takes precidence over interpreting all content.

# CONTEXT:
- Target race id: ${raceId}
- Target races included in this scan context: ${targetRacesStr}
- This entry list was loaded from Firestore for that race. Each id is a race-results document id; set matchedCompetitorId to that id when you match a row to that competitor.
- Sheet includes a lap column: ${lapsPresent ? "Yes" : "No"}
- Time interpretation mode: ${timeInterpretationMode}

# RULES:
1. THE ENTRY LIST MUST BE USED TO CORRECT MISTAKES:
  - Expected Competitor Entry List: ${roster}
  - When reading a class and sail number, compare it to the entry list. 
  - If the handwritten text is messy (e.g., '1234S' instead of '12345'), but the entry list contains '12345' in that class, confidently correct it to '12345' and mark it HIGH confidence, setting 'matchedCompetitorId' to the found id.

2. CLASS ALIASES:
  - Class Aliases: ${aliasesStr}
  - If you see a shorthand class name (e.g., 'A9', 'LR'), check the aliases and output the mapped, correct value (e.g., 'Aero 9', 'ILCA 6').

3. STATUS CODES & CROSSED-OUT ROWS:
   - Check the time column for standard sailing status codes (DNS, RET, OCS, BFD, DNF, DSQ, etc.). 
   -- If you see one, set the 'time.value' to placeholder value and update the 'status' field.
   - Ignore any data that has a distinct horizontal line drawn through it or is heavily scribbled out. If a whole row is struck through, ignore it or output it with a status of 'STRUCK_THROUGH' (in 'status') or 'FAILED' confidence. If a time is crossed out but a new one is written next to it, take the new one.

${lapRules}

${timeRules}

${orderExpectation}
   Use this expectation to catch OCR errors. If a row breaks the expected sequence drastically and looks like a misread, flag it as 'MANUAL_CHECK' and/or provide alternatives.

7. CONFIDENCE RATINGS:
   You must assign one of the following confidence levels to each extracted value AND the row overall:
   - HIGH: You are certain of the read, especially if it matches the ENTRY LIST exactly.
   - MANUAL_CHECK: The handwriting is somewhat unclear, or you corrected a typo, or the time is out of sequence.
   - FAILED / AMBIGUOUS: It is not readable or decipherable. Only output alternatives if you have a guess. Output 'FAILED' if it's completely unreadable scribbles.

8. PAGE NOTES:
   - If there is a large note spanning multiple rows or columns (e.g., "RACE ABANDONED due to gusts"), extract it entirely into the 'pageNotes' root field on the JSON object, do not force it into competitor rows.

${outputTimeStructure}

Respond strictly with the requested JSON schema. Do not include markdown blocks like \`\`\`json around the response, output just raw JSON.
`;
}
