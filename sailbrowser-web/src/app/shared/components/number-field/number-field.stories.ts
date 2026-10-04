import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { NumberField } from './number-field';

@Component({
  selector: 'number-field-demo',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, NumberField],
  template: `
    <form [formGroup]="form" style="display: flex; flex-direction: column; gap: 12px; max-width: 320px">
      <mat-form-field>
        <mat-label>Laps (integer)</mat-label>
        <input matInput appNumberField formControlName="laps" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>Handicap (decimal)</mat-label>
        <input matInput appNumberField="decimal" formControlName="handicap" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>Latitude (signed)</mat-label>
        <input matInput appNumberField="signedDecimal" formControlName="latitude" />
      </mat-form-field>
    </form>
    <p>laps={{ form.controls.laps.value || '(empty)' }} handicap={{ form.controls.handicap.value || '(empty)' }} lat={{ form.controls.latitude.value || '(empty)' }}</p>
  `,
})
class NumberFieldDemoHost {
  readonly form = new FormGroup({
    laps: new FormControl<string | number | null>(null),
    handicap: new FormControl<string | number | null>(null),
    latitude: new FormControl<string | number | null>(null),
  });
}

const meta: Meta<NumberFieldDemoHost> = {
  title: 'Shared/NumberField',
  component: NumberFieldDemoHost,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Attribute directive that keeps native text inputs numeric: integer, unsigned decimal, or signed decimal (lat/lon).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<NumberFieldDemoHost>;

export const Empty: Story = {};

export const FiltersLetters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const laps = canvas.getByLabelText('Laps (integer)');
    await userEvent.click(laps);
    await userEvent.type(laps, '12ab3');
    expect((laps as HTMLInputElement).value).toBe('123');
  },
};
