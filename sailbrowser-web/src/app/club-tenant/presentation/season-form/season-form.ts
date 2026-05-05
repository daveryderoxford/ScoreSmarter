import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { SubmitButton } from 'app/shared/components/submit-button';
import { Season, SeasonStatus } from 'app/race-calender/model/season';

@Component({
  selector: 'app-season-form',
  templateUrl: './season-form.html',
  styles: `
    @use "mixins" as mix;

    @include mix.form-page("form", 350px);

    .button-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
    }
  `,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, SubmitButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeasonForm {

  season = input<Season | undefined>();

  busy = input<boolean>(false);
  submitted = output<Partial<Season>>();

  form = new FormGroup({
    name: new FormControl('', { validators: [Validators.required] }),
    status: new FormControl<SeasonStatus>('current', { validators: [Validators.required] }),
  });

  constructor() {
    effect(() => {
      const s = this.season();
      if (s) {
        this.form.patchValue({
          name: s.name,
          status: s.status === 'archived' ? 'archived' : 'current',
        });
      }
    });
  }

  submit() {
    const output: Partial<Season> = this.form.getRawValue() as Partial<Season>;
    this.submitted.emit(output);
    this.form.reset();
  }

  public canDeactivate(): boolean {
    return !this.form.dirty;
  }
}
