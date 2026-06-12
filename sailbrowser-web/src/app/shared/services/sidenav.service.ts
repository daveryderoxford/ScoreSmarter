import { Injectable, signal } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';

@Injectable({
  providedIn: 'root',
})
export class SidenavService {
  private sidenav: MatSidenav | null = null;

  /** Set when the user first opens or toggles the sidenav; triggers lazy menu load. */
  readonly menuRequested = signal(false);

  public setSidenav(sidenav: MatSidenav) {
    this.sidenav = sidenav;
  }

  public open() {
    this.menuRequested.set(true);
    return this.sidenav!.open();
  }

  public close() {
    return this.sidenav!.close();
  }

  public toggle(): void {
    this.menuRequested.set(true);
    this.sidenav!.toggle();
  }
}
