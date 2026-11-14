import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import type { FieldCheck } from '../model/compare-scoring';
import { describeSeries } from '../model/sailwave-series';
import { OnboardingSession } from '../services/onboarding-session';

@Component({
  selector: 'app-onboarding-wizard',
  imports: [
    PageLayout,
    Toolbar,
    MatStepperModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    NgTemplateOutlet,
  ],
  providers: [OnboardingSession],
  templateUrl: './onboarding-wizard.html',
  styleUrl: './onboarding-wizard.scss',
})
export class OnboardingWizard {
  protected readonly session = inject(OnboardingSession);
  protected readonly indexUrl = signal('');
  protected readonly describe = describeSeries;

  protected fetchResults(): void {
    void this.session.fetchResults(this.indexUrl());
  }

  protected onHtml(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void this.session.addHtmlFiles(input.files);
    input.value = '';
  }

  protected onInstructions(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.session.readInstructions(file);
  }

  protected checkLabel(check: FieldCheck | undefined): string {
    if (!check) return 'Waiting for the sailing instructions.';
    if (check.status === 'match') return `Agrees with the results. ${check.detail}`;
    if (check.status === 'consistent') return `Agrees so far. ${check.detail}`;
    if (check.status === 'disagree') return `Differs from the results. ${check.detail}`;
    return check.detail;
  }
}
