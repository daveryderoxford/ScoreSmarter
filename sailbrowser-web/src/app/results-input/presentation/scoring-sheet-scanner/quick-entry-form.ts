import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { EntryService } from 'app/entry/services/entry.service';
import { RaceCalendarStore } from 'app/race-calender';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { SubmitButton } from 'app/shared/components/submit-button';

@Component({
  selector: 'app-quick-entry-form',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    ReactiveFormsModule,
    SubmitButton
  ],
  template: `
    <div class="overlay">
      <mat-card class="form-card" appearance="raised">
        <mat-card-header>
          <mat-card-title>Enter Competitor</mat-card-title>
          <div class="spacer"></div>
          <button mat-icon-button (click)="cancelled.emit()">
            <mat-icon>close</mat-icon>
          </button>
        </mat-card-header>
        
        <mat-card-content>
          <form [formGroup]="form" class="entry-form">
            <p class="hint">
              Adding <strong>{{ boatClass() }} #{{ sailNumber() }}</strong> to the race entries.
            </p>
            
            <mat-form-field>
              <mat-label>Helm Name</mat-label>
              <input matInput formControlName="helm" placeholder="e.g. John Doe">
              <mat-error>Helm is required</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Crew Name (Optional)</mat-label>
              <input matInput formControlName="crew">
            </mat-form-field>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <button matButton (click)="cancelled.emit()" [disabled]="loading()">Cancel</button>
          <app-submit-button [busy]="loading()" [disabled]="form.invalid"/>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      backdrop-filter: blur(2px);
    }
    .form-card {
      width: 100%;
      max-width: 450px;
    }
    mat-card-header {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      width: 100%;
    }
    .spacer { flex: 1; }
    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hint {
      margin: 16px 0;
      font-size: 0.9rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `]
})
export class QuickEntryForm {
  private readonly fb = inject(FormBuilder);
  private readonly entryService = inject(EntryService);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly entryStore = inject(SeriesEntryStore);
  
  boatClass = input.required<string>();
  sailNumber = input.required<string>();
  raceId = input.required<string>();

  cancelled = output<void>();
  submitted = output<{ competitorId: string }>();

  form = this.fb.nonNullable.group({
    helm: ['', Validators.required],
    crew: ['']
  });

  loading = signal(false);

  async submit() {
    if (this.form.invalid) return;

    this.loading.set(true);
    try {
      const race = this.raceCalendarStore.allRaces().find(r => r.id === this.raceId());
      if (!race) throw new Error('Race not found');

      const entryDetails = {
        races: [race],
        helm: this.form.value.helm!,
        crew: this.form.value.crew,
        boatClass: this.boatClass(),
        sailNumber: parseInt(this.sailNumber(), 10)
      };

      await this.entryService.enterRaces(entryDetails);
      
      // Look for the newly created competitor
      // We might need to wait for the store to update, but typically entryService calls addResult
      const comps = this.competitorStore.selectedCompetitors().filter(c => c.raceId === this.raceId());
      const entries = this.entryStore.selectedEntries();
      
      const newComp = comps.find(c => {
        const entry = entries.find(e => e.id === c.seriesEntryId);
        return entry && 
               entry.boatClass === entryDetails.boatClass && 
               entry.sailNumber === entryDetails.sailNumber &&
               entry.helm === entryDetails.helm;
      });

      if (newComp) {
        this.submitted.emit({ competitorId: newComp.id });
      } else {
        // Fallback for sync delays
        this.submitted.emit({ competitorId: 'LATEST' });
      }
    } catch (err: any) {
      console.error('Quick Entry Error:', err);
      // In a real app we'd show an error message, but avoiding snackbar as it might need animations
      alert('Error entering competitor: ' + err.message);
    } finally {
      this.loading.set(false);
    }
  }
}
