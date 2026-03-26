import { Pipe, PipeTransform } from "@angular/core";
import { Race } from 'app/race-calender';

const formatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});

/** 
 * Title of a race object on a single line
*/
@Pipe({
  name: 'racetitle',
  pure: true,
})
export class RaceTitlePipe implements PipeTransform {
  transform(race: Race): string {
    const date = formatter.format(race.scheduledStart);
    const ret = `${race.seriesName} - R${race.index} - ${date}`;
    return (race.raceOfDay > 1) ? `${ret} / ${race.raceOfDay}` : ret;
  }
}