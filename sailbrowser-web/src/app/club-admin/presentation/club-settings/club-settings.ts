import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubStore } from 'app/club-tenant';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { Toolbar } from 'app/shared/components/toolbar';
import { SubmitButton } from 'app/shared/components/submit-button';
import { ClubLogoService } from '../../services/club-logo.service';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import {
  CLUB_LOGO_MAX_SOURCE_BYTES,
  resizeFileToClubLogoJpeg,
  type ClubLogoJpeg,
} from '../../services/resize-club-logo';

const ALLOWED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-club-settings',
  imports: [
    Toolbar,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    SubmitButton,
    ClubLogo,
  ],
  templateUrl: './club-settings.html',
  styleUrl: './club-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);
  private readonly clubTenant = inject(ClubTenant);
  private readonly clubLogoService = inject(ClubLogoService);
  private readonly snackBar = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly pendingLogoPreviewUrl = signal<string | null>(null);
  readonly hasPendingLogo = signal(false);
  private pendingLogo: ClubLogoJpeg | null = null;

  readonly form = this.fb.group({
    name: ['', Validators.required],
    shortName: [''],
    contactName: ['', Validators.required],
    contactEmail: ['', [Validators.required, Validators.email]],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    websiteUrl: [''],
  });

  constructor() {
    effect(() => {
      const club = this.clubStore.club();
      if (!club?.id) {
        return;
      }
      this.form.patchValue(
        {
          name: club.name,
          shortName: club.shortName ?? '',
          contactName: club.contactName,
          contactEmail: club.contactEmail,
          latitude: club.latitude ?? null,
          longitude: club.longitude ?? null,
          websiteUrl: club.websiteUrl ?? '',
        },
        { emitEvent: false },
      );
    });
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      this.snackBar.open('Logo must be a JPEG, PNG, or WebP image.', 'Dismiss', { duration: 5000 });
      input.value = '';
      return;
    }
    if (file.size > CLUB_LOGO_MAX_SOURCE_BYTES) {
      this.snackBar.open('Logo source file must be 8 MB or smaller.', 'Dismiss', { duration: 5000 });
      input.value = '';
      return;
    }

    this.busy.set(true);
    try {
      const jpeg = await resizeFileToClubLogoJpeg(file);
      this.pendingLogo = jpeg;
      this.hasPendingLogo.set(true);
      this.form.markAsDirty();
      this.pendingLogoPreviewUrl.set(jpeg.previewUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not process logo image.';
      this.snackBar.open(message, 'Dismiss', { duration: 6000 });
      input.value = '';
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      return;
    }

    this.busy.set(true);
    try {
      const clubId = this.clubTenant.clubId;
      const v = this.form.getRawValue();

      if (this.pendingLogo) {
        await this.clubLogoService.uploadLogo(
          clubId,
          this.pendingLogo.base64,
          this.pendingLogo.mimeType,
        );
        this.pendingLogo = null;
        this.hasPendingLogo.set(false);
      }

      await this.clubStore.update({
        name: v.name!.trim(),
        shortName: v.shortName?.trim() || undefined,
        contactName: v.contactName!.trim(),
        contactEmail: v.contactEmail!.trim(),
        latitude: this.toOptionalNumber(v.latitude),
        longitude: this.toOptionalNumber(v.longitude),
        websiteUrl: v.websiteUrl?.trim() || undefined,
      });

      this.form.markAsPristine();
      this.snackBar.open('Club settings saved.', 'Dismiss', { duration: 3000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save club settings.';
      this.snackBar.open(message, 'Dismiss', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate(): boolean {
    return !this.form.dirty && !this.pendingLogo;
  }

  private toOptionalNumber(value: number | null | undefined): number | undefined {
    if (value == null || Number.isNaN(value)) {
      return undefined;
    }
    return value;
  }
}
