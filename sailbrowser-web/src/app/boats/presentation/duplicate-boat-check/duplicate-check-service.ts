import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { BoatsDupDialogData, BoatsDuplicatesDialog } from './boats-duplicates-dialog';
import { Boat, BoatsStore } from 'app/boats';

@Injectable({
  providedIn: 'root'
})
export class DuplicateBoatCheck {
  private snackbar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private bs = inject(BoatsStore);

  async duplicateCheck(boat: Partial<Boat>, options?: { excludeBoatId?: string }): Promise<boolean> {
    const check = checkForDuplicateBoats(boat, this.bs.boats(), options);

    if (check.isDuplicate) {
      this.snackbar.open("Duplicate Boat exists in boat repository", "Dismiss", { duration: 4000 });
      return false;
    } else if (check.matches.length > 0) {
      return await this.showDialog(boat as Boat, check.matches);
    }
    return true;
  }

  async showDialog(boat: Boat, dups: Boat[]): Promise<boolean> {

    const dialogRef = this.dialog.open<BoatsDuplicatesDialog, BoatsDupDialogData>(BoatsDuplicatesDialog, {
      data: { boat: boat, possibleDuplicates: dups },
    });
    return firstValueFrom(dialogRef.afterClosed());
  }
}

/** Checks for duplicate boats, returning a list of boats that
 * match exactly and ones that are similar to.
 */
function checkForDuplicateBoats(
  newBoat: Partial<Boat>,
  allBoats: Boat[],
  options?: { excludeBoatId?: string }
): { isDuplicate: boolean, matches: Boat[]; } {
  const possibles = allBoats.filter(boat =>
    boat.id !== options?.excludeBoatId &&
    boat.boatClass === newBoat.boatClass &&
    boat.sailNumber === newBoat.sailNumber
  );

  const newName = (newBoat.name ?? '').trim().toLowerCase();
  const newHelm = (newBoat.helm ?? '').trim().toLowerCase();

  const isDuplicate = possibles.find(boat => {
    const existingName = (boat.name ?? '').trim().toLowerCase();
    const existingHelm = (boat.helm ?? '').trim().toLowerCase();
    // Primary identity is class + sail number + name.
    // If name is blank on either side, fall back to helm for backward compatibility.
    if (newName && existingName) {
      return existingName === newName;
    }
    return existingHelm.length > 0 && existingHelm === newHelm;
  }) !== undefined;

  return { isDuplicate, matches: possibles };
}