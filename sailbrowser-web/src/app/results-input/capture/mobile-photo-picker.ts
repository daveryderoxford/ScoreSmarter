import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

/**
 * Mobile photo source picker: explicit Take Photo vs Choose from Photos menu.
 * Android Chrome opens the gallery for a plain file input; iOS Safari shows a
 * native action sheet. This component gives both platforms the same choices.
 */
@Component({
  selector: 'app-mobile-photo-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <input
      #cameraInput
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      (change)="onInputChange($event, cameraInput)" />
    <input
      #galleryInput
      type="file"
      accept="image/*"
      hidden
      (change)="onInputChange($event, galleryInput)" />

    @if (buttonStyle() === 'fab') {
      <button matFab extended type="button" [matMenuTriggerFor]="photoMenu">
        <mat-icon>camera_alt</mat-icon>
        {{ buttonLabel() }}
      </button>
    } @else {
      <button matButton="filled" class="full-width" type="button" [matMenuTriggerFor]="photoMenu">
        <mat-icon>photo_camera</mat-icon>
        {{ buttonLabel() }}
      </button>
    }

    <mat-menu #photoMenu="matMenu">
      <button mat-menu-item type="button" (click)="cameraInput.click()">
        <mat-icon>photo_camera</mat-icon>
        <span>Take Photo</span>
      </button>
      <button mat-menu-item type="button" (click)="galleryInput.click()">
        <mat-icon>photo_library</mat-icon>
        <span>Choose from Photos</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    :host {
      display: contents;
    }
    .full-width {
      width: 100%;
    }
  `],
})
export class MobilePhotoPicker {
  readonly buttonLabel = input('Take Photo');
  readonly buttonStyle = input<'fab' | 'filled'>('fab');

  readonly fileSelected = output<File>();

  onInputChange(event: Event, input: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    input.value = '';
    if (file) this.fileSelected.emit(file);
  }
}
