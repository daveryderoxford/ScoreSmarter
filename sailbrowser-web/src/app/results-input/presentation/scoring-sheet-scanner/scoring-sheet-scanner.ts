import { Component, computed, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseApp } from '@angular/fire/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { environment } from '../../../../environments/environment';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RaceCalendarStore } from 'app/race-calender';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { format } from 'date-fns';

/** Slightly below parseResultsSheet timeoutSeconds in Cloud Functions. */
const PARSE_RESULTS_SHEET_CALLABLE_TIMEOUT_MS = 318_000;

/** Extract HttpsError.details from Firebase callable errors (shape varies slightly by SDK). */
function extractCallableDetails(err: unknown): Record<string, unknown> | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  const d = e['details'];
  if (d && typeof d === 'object') return d as Record<string, unknown>;
  const customData = e['customData'];
  if (customData && typeof customData === 'object') {
    const inner = (customData as Record<string, unknown>)['details'];
    if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
  }
  return undefined;
}

function formatParseSheetError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Error parsing image. Check console for details.';
  const details = extractCallableDetails(err);
  if (!details) return message;
  const lines = [message];
  const rid = details['requestId'];
  const stage = details['stage'];
  const cause = details['cause'];
  if (typeof rid === 'string' && rid) lines.push(`Request ID: ${rid}`);
  if (typeof stage === 'string' && stage) lines.push(`Stage: ${stage}`);
  if (typeof cause === 'string' && cause) lines.push(`Cause: ${cause}`);
  const fr = details['finishReason'];
  if (typeof fr === 'string' && fr) lines.push(`Gemini finish: ${fr}`);
  const pe = details['parseError'];
  if (typeof pe === 'string' && pe) lines.push(`Parse: ${pe}`);
  const vm = details['vertexMessage'];
  if (typeof vm === 'string' && vm) lines.push(`Vertex: ${vm}`);
  return lines.join('\n');
}

@Component({
  selector: 'app-scoring-sheet-scanner',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    JsonPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    MatIconModule,
    MatCheckboxModule,
    MatCardModule,
    MatProgressBarModule,
  ],
  templateUrl: './scoring-sheet-scanner.html',
  styleUrl: './scoring-sheet-scanner.scss',
})
export class ScoringSheetScanner {
  private fb = inject(FormBuilder);
  private app = inject(FirebaseApp);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly clubTenant = inject(ClubTenant);

  form = this.fb.nonNullable.group({
    raceId: ['', Validators.required],
    listOrder: ['chronological', Validators.required],
    timeFormat: this.fb.nonNullable.control<'hours_minutes_seconds' | 'minutes_seconds_only'>(
      'hours_minutes_seconds',
      Validators.required,
    ),
    lapsPresentOnSheet: this.fb.nonNullable.control(true, Validators.required),
    lapFormat: ['numbers', Validators.required],
    hasHours: [false, Validators.required],
    defaultHour: [14],
    defaultLaps: [1],
  });

  readonly raceOptions = computed(() =>
    this.raceCalendarStore.allRaces().map((r) => ({
      id: r.id,
      label: `${r.seriesName} — Race ${r.index} (${format(r.scheduledStart, 'yyyy-MM-dd')})`,
    })),
  );

  imageBase64 = signal<string | null>(null);
  imageMimeType = signal<string | null>(null);
  imagePreview = signal<string | null>(null);

  loading = signal<boolean>(false);
  result = signal<unknown>(null);
  error = signal<string | null>(null);

  onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      this.imageBase64.set(null);
      this.imageMimeType.set(null);
      this.imagePreview.set(null);
      return;
    }

    this.imageMimeType.set(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.imagePreview.set(readResult);

      const base64 = readResult.split(',')[1];
      this.imageBase64.set(base64);
    };
    reader.readAsDataURL(file);
  }

  async scan() {
    if (!this.imageBase64() || !this.imageMimeType()) return;
    if (this.form.invalid) {
      this.error.set('Select a race and complete the context form.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      } catch {
        // Ignore "already configured" errors as it could be called repeatedly
      }
    }
    const parseFn = httpsCallable(functions, 'parseResultsSheet', {
      timeout: PARSE_RESULTS_SHEET_CALLABLE_TIMEOUT_MS,
    });

    const v = this.form.getRawValue();
    const scannerContext = {
      targetRaces: [] as string[],
      lapFormat: v.lapFormat as 'numbers' | 'ticks',
      hasHours: v.hasHours,
      defaultHour: v.defaultHour,
      defaultLaps: v.defaultLaps,
      listOrder: v.listOrder as 'chronological' | 'firstLap' | 'unsorted',
      classAliases: {} as Record<string, string>,
      roster: [] as { id: string; class: string; sailNumber: string; name?: string }[],
      lapsPresentOnSheet: v.lapsPresentOnSheet,
      timeFormat: v.timeFormat,
    };

    try {
      const res = await parseFn({
        imageBase64: this.imageBase64(),
        imageMimeType: this.imageMimeType(),
        clubId: this.clubTenant.clubId,
        raceId: this.form.value.raceId,
        scannerContext,
      });
      this.result.set(res.data);
    } catch (err: unknown) {
      this.error.set(formatParseSheetError(err));
      console.error('Scan error:', err, extractCallableDetails(err));
    } finally {
      this.loading.set(false);
    }
  }
}
