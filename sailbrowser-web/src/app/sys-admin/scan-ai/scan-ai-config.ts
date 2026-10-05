import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { ScannerThinkingLevel } from '@shared/scanner-context';
import { SubmitButton } from 'app/shared/components/submit-button';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ScanAiConfigService } from 'app/results-input/scoring-sheet-scanner/model/scan-ai-config.service';
import {
  DEFAULT_SCAN_MODEL,
  DEFAULT_SCAN_THINKING_LEVEL,
  SCAN_AI_KNOWN_MODELS,
  SCAN_AI_THINKING_LEVELS,
} from 'app/results-input/scoring-sheet-scanner/model/scan-ai-models';

@Component({
  selector: 'app-scan-ai-config',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterLink,
    Toolbar,
    PageLayout,
    SubmitButton,
  ],
  templateUrl: './scan-ai-config.html',
  styles: `
    .form-card {
      max-width: 36rem;
      margin: 1.5rem auto;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      margin-top: 0.5rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanAiConfigPage {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(ScanAiConfigService);
  private readonly snackbar = inject(MatSnackBar);

  readonly knownModels = SCAN_AI_KNOWN_MODELS;
  readonly thinkingLevels = SCAN_AI_THINKING_LEVELS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly lastSaved = signal<{ at?: Date; by?: string } | null>(null);

  readonly form = this.fb.nonNullable.group({
    model: [DEFAULT_SCAN_MODEL, [Validators.required, Validators.maxLength(127)]],
    thinkingLevel: this.fb.nonNullable.control<ScannerThinkingLevel>(
      DEFAULT_SCAN_THINKING_LEVEL,
      Validators.required,
    ),
  });

  constructor() {
    void this.reload();
  }

  applyKnownModel(id: string): void {
    this.form.controls.model.setValue(id);
    this.form.controls.model.markAsDirty();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const cfg = await this.config.load();
      this.form.reset({ model: cfg.model, thinkingLevel: cfg.thinkingLevel });
      this.lastSaved.set({ at: cfg.updatedAt, by: cfg.updatedBy });
    } catch (err: unknown) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load scan AI config.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const { model, thinkingLevel } = this.form.getRawValue();
      await this.config.save(model, thinkingLevel);
      this.form.markAsPristine();
      this.snackbar.open('Scan AI default saved. The next scan will use it.', 'Dismiss', {
        duration: 4000,
      });
      await this.reload();
    } catch (err: unknown) {
      this.snackbar.open(
        err instanceof Error ? err.message : 'Failed to save scan AI config.',
        'Dismiss',
        { duration: 5000 },
      );
    } finally {
      this.saving.set(false);
    }
  }
}
