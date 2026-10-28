import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubRegistration, ClubRegistrationsService } from './club-registrations.service';

const clubUrl = (clubId: string) => `https://${clubId}.ro.scoresmarter.app`;

@Component({
  selector: 'app-registration-card',
  imports: [DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  templateUrl: './registration-card.html',
  styleUrl: './registration-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationCard implements OnInit {
  private readonly service = inject(ClubRegistrationsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly registration = input.required<ClubRegistration>();

  // Format checks are done by approveClubRegistration, which explains any problem.
  protected readonly clubId = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  protected readonly clubName = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly url = computed(() => clubUrl(this.registration().clubId ?? this.registration().subdomain));

  /**
   * The welcome link from the last approval or resend. Only its hash is stored, so it is
   * known only straight after one of those.
   */
  protected readonly welcomeLink = signal<string | undefined>(undefined);

  /** For the sys-admin to send when the welcome email could not be sent. */
  protected readonly welcomeMessage = computed(() => {
    const r = this.registration();
    return [
      `Hello ${r.contactName.split(' ')[0]},`,
      '',
      `${r.clubName} is now set up on ScoreSmarter at ${this.url()}`,
      '',
      'Open this link to set up your administrator account (valid for 30 days):',
      this.welcomeLink() ?? '',
      '',
      'You can choose a password, or continue with your Google account. Once you are in, '
        + 'open Club settings to upload your burgee or logo.',
    ].join('\n');
  });

  ngOnInit(): void {
    this.clubId.setValue(this.registration().subdomain);
    this.clubName.setValue(this.registration().clubName);
  }

  async approve(): Promise<void> {
    if (this.clubId.invalid || this.clubName.invalid) return;
    await this.run(async () => {
      const result = await this.service.approve(
        this.registration().id,
        this.clubId.value.trim().toLowerCase(),
        this.clubName.value.trim(),
      );
      this.welcomeLink.set(result.welcomeUrl);
      this.snackBar.open(
        result.emailSent ? `Club created and ${this.registration().contactEmail} emailed.`
          : 'Club created, but the email could not be sent. Copy the welcome message and send it.',
        'Close',
        { duration: 8000 },
      );
    });
  }

  /** New welcome link (the old one stops working), emailed to the contact. */
  async resendWelcome(): Promise<void> {
    await this.run(async () => {
      const result = await this.service.resendWelcome(this.registration().id);
      this.welcomeLink.set(result.welcomeUrl);
      this.snackBar.open(
        result.emailSent ? `New welcome link emailed to ${this.registration().contactEmail}.`
          : 'New welcome link created, but the email could not be sent. Copy the welcome message and send it.',
        'Close',
        { duration: 8000 },
      );
    });
  }

  async reject(): Promise<void> {
    await this.run(() => this.service.setStatus(this.registration().id, 'rejected'));
  }

  async reopen(): Promise<void> {
    await this.run(() => this.service.setStatus(this.registration().id, 'new'));
  }

  async copyWelcome(): Promise<void> {
    await navigator.clipboard.writeText(this.welcomeMessage());
    this.snackBar.open('Message copied', 'Close', { duration: 3000 });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (err: unknown) {
      console.error('RegistrationCard: action failed', err);
      this.error.set(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
