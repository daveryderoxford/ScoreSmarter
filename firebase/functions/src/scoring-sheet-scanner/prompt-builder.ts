import { defaultClassAliases } from "./class-aliases.js";
import { ScannerContext } from "./ai-scan-types.js";

export function buildPrompt(ctx: ScannerContext, raceId: string): string {
  const aliasesStr = ctx.classAliases ? JSON.stringify(ctx.classAliases) : JSON.stringify(defaultClassAliases);

  const roster = ctx.roster && ctx.roster.length > 0
    ? JSON.stringify(ctx.roster)
    : "No entry list provided";

  const targetRacesStr = ctx.targetRaces?.length
    ? JSON.stringify(ctx.targetRaces)
    : JSON.stringify([raceId]);

  const lapsPresent = ctx.lapsPresentOnSheet !== false;
  const timeFormat = ctx.timeFormat ?? "clock_hms";

  const lapRules = !lapsPresent
    ? 
  `4. NO LAP COLUMN ON THIS SHEET:
  The race officer did not record laps on this sheet. Set laps to a default of 1.`
    : ctx.lapFormat === "ticks" ? 
  `4. LAP COLUMN PRESENT — TICKS/TALLIES FORMAT:
  - Interpret lap marks as tallies/checkmarks (e.g., ||| = 3, VV = 2). If both tallies and a final number are present, use the final number.
  - When no lap value is visible in a row default to a value of ${ctx.defaultLaps ?? "Unknown"}`
      :     
  `4. LAP COLUMN PRESENT — NUMERIC FORMAT:
  - Read lap counts only as integer numbers (1, 2, 3, ...).
  - Ignore tally/checkmark interpretation in this mode.
  - If no laps are written in a row default to ${ctx.defaultLaps ?? "Unknown"}`
 
  const timeRules = timeFormat === "clock_hms"
    ? `5. TIME FORMAT — CLOCK TIME (H:M:S):
  - Read times as real clock times with hours, minutes, and seconds (H:MM:SS).
  - A two-part value may be written as MM:SS when hour is omitted.
  - If only 2 fields are present:
  -- interpret as the hour is missing hour.  
  -- Use hour value in adjacent rows to estimate it or use default value of ${ctx.defaultHour ?? "Unknown"}.  
  - Preserve clock semantics; do not reinterpret this mode as pure elapsed stopwatch mode.
  - Ensure minutes and seconds are 0-59; provide alternatives when ambiguous.`
    : timeFormat === "stopwatch_hms_elapsed"
      ? `5. TIME FORMAT — STOPWATCH ELAPSED WITH HOURS (H:MM:SS):
  - Times are recorded as stopwatch durations, NOT wall-clock time.
  - Times less than 1 hour will have minutes, seconds fields
  - Times greater than hour hour will have hour, minute, second field. 
  - Use context to determine if the race officer has unintentionally omitted the record the hour field
  - Ensure minutes/seconds are 0-59 and provide alternatives when ambiguous.`
      : `5. TIME FORMAT — STOPWATCH ELAPSED MINUTES/SECONDS (MM:SS):
  - Times are recorded as stopwatch durations, NOT wall-clock time.
  - All times will be recored as elapsed minutes, seconds
  - Example conversion: 45:30 -> 00:45:30.
  -- Minutes may have any positive integer value
  -- Ensure seconds are in the range 0-59. Provide alternatives when ambiguous.
`;

  const orderExpectation = ctx.listOrder === "chronological"
    ? `6. ORDER EXPECTATION — CHRONOLOGICAL:
   - Times should generally strictly increase as you read down.`
    : ctx.listOrder === "firstLap"
      ? `6. ORDER EXPECTATION — FIRST LAP:
   - Times generally increase, but overtakes/laps can make ordering approximate, especially with mixed lap counts.`
      : `6. ORDER EXPECTATION — UNSORTED:
   - Do not rely on ordering; evaluate each row independently.`;

  return `
- You are reading a handwritten race results sheet for a sailing race. 
- You must follow these strict rules to maximize accuracy and provide structured output.
- Ensuring results are recorded accuratly is takes precidence over interpreting all content.

# CONTEXT:
- Target race id: ${raceId}
- This entry list was loaded from Firestore for that race. Each id is a race-results document id; set matchedCompetitorId to that id when you match a row to that competitor.
- Sheet includes a lap column: ${lapsPresent ? "Yes" : "No"}
- Time interpretation mode: ${timeFormat === "clock_hms" ? "Clock H:M:S (real time)" : timeFormat === "stopwatch_hms_elapsed" ? "Stopwatch elapsed H:MM:SS" : "Stopwatch elapsed MM:SS"}

# RULES:
1. THE ENTRY LIST MUST BE USED TO CORRECT MISTAKES:
  - Expected Competitor Entry List: ${roster}
  - When reading a class and sail number, compare it to the entry list. 
  - If the handwritten text is messy (e.g., '1234S' instead of '12345'), but the entry list contains '12345' in that class, confidently correct it to '12345' and mark it HIGH confidence, setting 'matchedCompetitorId' to the found id.

2. CLASS ALIASES:
  - Class Aliases: ${aliasesStr}
  - If you see a shorthand class name (e.g., 'A9', 'LR'), check the aliases and output the mapped, correct value (e.g., 'Aero 9', 'ILCA 6').

3. STATUS CODES & CROSSED-OUT ROWS:
   - Check the time column for standard sailing status codes (DNS, RET, OCS, BFD, DNF, DSQ, etc.). If you see one, set the 'time.value' to null and update the 'status' field.
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

9. OUTPUT TIME STRUCTURE (REQUIRED):
   For rows with status "OK", output time.value as a structured object that matches the selected time mode.
   - If mode is clock_hms or stopwatch_hms_elapsed: time.value = { "hours": number, "minutes": number, "seconds": number }.
   - If mode is stopwatch_ms_elapsed: time.value = { "elapsedMinutes": number, "seconds": number }.
   Use numeric fields only, with minutes/seconds in range 0-59.
   For non-finish/status rows (DNS, DNF, RET, DSQ, etc.), still return a placeholder object matching the selected mode:
   - H:M:S modes: { "hours": 0, "minutes": 0, "seconds": 0 }
   - MM:SS mode: { "elapsedMinutes": 0, "seconds": 0 }

Respond strictly with the requested JSON schema. Do not include markdown blocks like \`\`\`json around the response, output just raw JSON.
`;
}
