import { addSeconds, format } from 'date-fns';
import { ResolvedRaceCompetitor } from '../../results-input/model/resolved-race-competitor';
import { ResultCode } from 'app/scoring/model/result-code';

/** Generate a CSV file of raw results to imprt into 
 * Sailwave.  Either elapsed times or start/finish times may be exported
 */
export function generateSailwaveCSV(
  competitors: ResolvedRaceCompetitor[],
  mode: 'elapsed' | 'raw' = 'elapsed'
): string {

  const commonHeaders = ['HelmName', 'CrewName', 'Boat', 'SailNo', 'Rating', 'Laps', 'Code'];

  const headers = (mode === 'raw') ?
    [...commonHeaders, 'Start', 'Finish'] :
    [...commonHeaders, 'Elapsed'];

  const rows = competitors.map(comp => {
    const isOk = (comp.resultCode === 'OK');

    // Build the row data
    const rowData: any[] = [
      comp.helm,
      comp.crew || '',
      comp.boatClass,
      comp.sailNumber,
      comp.handicapForScheme('PY') ?? '',
      comp.numLaps,
      toSailwaveCode(comp.resultCode)
    ];

    if (mode === 'raw') {
      rowData.push(isOk ? sailwaveTimeStr(comp.startTime) : '');
      rowData.push(isOk ? sailwaveTimeStr(comp.finishTime) : '');
    } else {
      rowData.push(isOk ? sailwaveDurationStr(comp.elapsedTime!) : '');
    }

    return rowData.map(val => `'${val}'`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/** Format time for sailwave */
const sailwaveTimeStr = (date: Date | undefined): string => {
  return date ? format(date, 'HH:mm:ss') : '';
};

/** Formats duration in seconds to HH:mm:ss for Sailwave */
function sailwaveDurationStr(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';

  // Create a date at 00:00:00 and add the elapsed seconds
  const helperDate = addSeconds(new Date(0), totalSeconds);

  // Format to HH:mm:ss. 
  // Note: Use 'HH' for 24h format to ensure 01:05:00 instead of 1:5:0
  return format(helperDate, 'HH:mm:ss');
};

 /** Sailwave uses capitalised results codes */
function toSailwaveCode(resultCode: ResultCode) {
  switch (resultCode) {
    case 'OK':
      return '';
    case 'NOT FINISHED':
      return 'DNF';
    default:
      return resultCode;
  }
}
