import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Toolbar } from 'app/shared/components/toolbar';
import { AuthorizedKiosk } from '../../model/authorized-kiosk';
import { KioskDevicesService } from '../../services/kiosk-devices.service';

@Component({
  selector: 'app-kiosk-devices',
  imports: [
    Toolbar,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
  ],
  templateUrl: './kiosk-devices.html',
  styleUrl: './kiosk-devices.scss',
})
export class KioskDevicesPage {
  private readonly service = inject(KioskDevicesService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  protected readonly busy = signal(false);
  protected readonly columns = ['label', 'deviceId', 'status', 'actions'];

  protected readonly kiosks = computed(() => {
    const rows = [...this.service.kiosks()];
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (a.label ?? a.deviceId).localeCompare(b.label ?? b.deviceId);
    });
    return rows;
  });

  protected readonly addForm = this.fb.nonNullable.group({
    deviceId: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_.:-]+$/)]],
    label: [''],
  });

  async register(): Promise<void> {
    if (this.addForm.invalid || this.busy()) return;
    const { deviceId, label } = this.addForm.getRawValue();
    this.busy.set(true);
    try {
      await this.service.manage(deviceId, 'register', label || undefined);
      this.addForm.reset({ deviceId: '', label: '' });
      this.snackbar.open('Tablet registered', 'Dismiss', { duration: 3000 });
    } catch (error: unknown) {
      console.error('KioskDevicesPage: register failed', error);
      this.snackbar.open('Failed to register tablet', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(kiosk: AuthorizedKiosk): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.service.manage(kiosk.deviceId, 'revoke');
      this.snackbar.open('Tablet revoked', 'Dismiss', { duration: 3000 });
    } catch (error: unknown) {
      console.error('KioskDevicesPage: revoke failed', error);
      this.snackbar.open('Failed to revoke tablet', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  async activate(kiosk: AuthorizedKiosk): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.service.manage(kiosk.deviceId, 'activate', kiosk.label);
      this.snackbar.open('Tablet re-activated', 'Dismiss', { duration: 3000 });
    } catch (error: unknown) {
      console.error('KioskDevicesPage: activate failed', error);
      this.snackbar.open('Failed to activate tablet', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }
}
