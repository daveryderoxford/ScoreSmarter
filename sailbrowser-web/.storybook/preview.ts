// .storybook/preview.ts
import { initializeApp } from '@angular/fire/app';
import { Preview, applicationConfig, componentWrapperDecorator } from '@storybook/angular';
import { provideFirebaseApp } from '@angular/fire/app';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideFirebaseApp(() =>
          initializeApp({
            apiKey: 'storybook',
            authDomain: 'storybook.local',
            projectId: 'storybook',
            appId: 'storybook',
          }),
        ),
        // Match the app's global form-field config (see app.config.ts). The app forces the
        // `outline` appearance everywhere and hides `fill` labels via styles.scss, so without
        // this stories would render `fill` fields with no visible floating label.
        {
          provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
          useValue: { appearance: 'outline' },
        },
      ],
    }),
    // This decorator wraps every story in a div and applies the base theme styles.
    // It mimics the app's `body` tag styles without needing to change global CSS.
    // This ensures that Material CSS variables for color and typography are
    // correctly defined and inherited by the components in the Storybook canvas.
    componentWrapperDecorator((story) => `
      <div style="background-color: var(--mat-sys-background);">
        ${story}
      </div>`),
  ]
};

export default preview;
