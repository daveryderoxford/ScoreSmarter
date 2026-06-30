import { Component, input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TimeInput } from './time-input';
import type { TimeInputFormat } from './time-input-segments';

@Component({
  selector: 'time-input-demo',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, TimeInput],
  template: `
    <mat-form-field style="width: 280px">
      <mat-label>{{ label() }}</mat-label>
      <app-time-input [formControl]="control" [format]="format()" />
    </mat-form-field>
    <p>Seconds: {{ control.value ?? '(empty)' }}</p>
  `,
})
class TimeInputDemoHost implements OnInit {
  readonly label = input('Time');
  readonly format = input<TimeInputFormat>('hms');
  readonly initial = input<number | null>(null);
  readonly disabled = input(false);

  readonly control = new FormControl<number | null>(null);

  ngOnInit(): void {
    const v = this.initial();
    if (v != null) this.control.setValue(v);
    if (this.disabled()) this.control.disable();
  }
}

function storyProviders() {
  return applicationConfig({
    providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
  });
}

const meta: Meta<TimeInputDemoHost> = {
  title: 'Shared/TimeInput',
  component: TimeInputDemoHost,
  tags: ['autodocs'],
  decorators: [storyProviders()],
  parameters: {
    docs: {
      description: {
        component:
          'Chrome-style single-field time entry. Formats: hms (HH:mm:ss clock) and mss (mmm:ss elapsed minutes).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<TimeInputDemoHost>;

export const HmsEmpty: Story = {
  args: { label: 'Clock time', format: 'hms' },
};

export const HmsPrefilled: Story = {
  args: {
    label: 'Clock time',
    format: 'hms',
    initial: 14 * 3600 + 32 * 60 + 5,
  },
};

export const MssEmpty: Story = {
  args: { label: 'Elapsed', format: 'mss' },
};

export const MssPrefilled: Story = {
  args: {
    label: 'Elapsed',
    format: 'mss',
    initial: 123 * 60 + 45,
  },
};

export const HmsDisabled: Story = {
  args: {
    label: 'Disabled',
    format: 'hms',
    initial: 10 * 3600,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  },
};

export const MobileViewport: Story = {
  ...HmsEmpty,
  parameters: {
    viewport: { defaultViewport: 'iphone14' },
  },
};

export const HmsTypeSequential: Story = {
  ...HmsEmpty,
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);
    const input = root.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '143205');
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('14:32:05');
    });
    await userEvent.tab();
    await waitFor(() => {
      expect(root.getByText(/Seconds:/)).toHaveTextContent(String(14 * 3600 + 32 * 60 + 5));
    });
  },
};

export const MssTypeSequential: Story = {
  ...MssEmpty,
  play: async ({ canvasElement }) => {
    const root = within(canvasElement);
    const input = root.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '12345');
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('123:45');
    });
  },
};

export const HmsBackspace: Story = {
  ...HmsPrefilled,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('14:32:05'));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => {
      expect(input.value).toBe('14:32:0');
    });
  },
};

export const RejectLetters: Story = {
  ...HmsEmpty,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox') as HTMLInputElement;
    await userEvent.type(input, 'abc');
    expect(input.value).toBe('');
  },
};
