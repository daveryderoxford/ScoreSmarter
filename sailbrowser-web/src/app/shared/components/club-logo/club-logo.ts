import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ClubLogoService } from 'app/club-admin/services/club-logo.service';

@Component({
  selector: 'app-club-logo',
  imports: [MatIconModule],
  templateUrl: './club-logo.html',
  styleUrl: './club-logo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'club-logo-host',
    '[class.club-logo-host--lg]': 'size() === "lg"',
    '[class.club-logo-host--sm]': 'size() === "sm"',
  },
})
export class ClubLogo {
  private readonly clubLogoService = inject(ClubLogoService);

  readonly alt = input('Club logo');
  readonly size = input<'sm' | 'lg'>('sm');
  readonly showPlaceholder = input(true);

  protected readonly logoUrl = this.clubLogoService.logoDownloadUrl;
}
