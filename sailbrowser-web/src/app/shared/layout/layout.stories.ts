import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { DetailHeading } from './detail-heading';
import { DetailPane } from './detail-pane';
import { DetailPlaceholder } from './detail-placeholder';
import { ListDetailLayout } from './list-detail-layout';
import { ListPane } from './list-pane';
import { PageLayout } from './page-layout';
import { Toolbar } from 'app/shared/components/toolbar';
import { SidenavService } from 'app/shared/services/sidenav.service';

const isWideLayout = signal(true);

function layoutProviders(wide: boolean) {
  isWideLayout.set(wide);
  return applicationConfig({
    providers: [
      { provide: AppBreakpoints, useValue: { isWideLayout, isMobile: signal(false) } },
      { provide: SidenavService, useValue: { toggle: () => undefined, menuRequested: signal(false) } },
      provideRouter([]),
    ],
  });
}

const demoTemplate = `
  <div style="height: 560px; border: 1px solid #ccc;">
    <app-page-layout>
      <app-toolbar [title]="title" [showBack]="showBack" />
      <app-list-detail-layout [detailOpen]="detailOpen" [listCollapsed]="listCollapsed" listWidth="320px">
        <app-list-pane list>
          <div listHeader style="padding: 12px; border-bottom: 1px solid #eee;">Search / New</div>
          <div style="padding: 12px;">
            <p>Boat 1</p>
            <p>Boat 2</p>
            <p>Boat 3</p>
          </div>
        </app-list-pane>
        <app-detail-pane detail maxWidth="350px">
          @if (showForm) {
            <app-detail-heading>Edit Boat</app-detail-heading>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <label>Class <input style="width: 100%; box-sizing: border-box;" value="ILCA 7" /></label>
              <label>Sail number <input style="width: 100%; box-sizing: border-box;" value="1234" /></label>
              <label>Helm <input style="width: 100%; box-sizing: border-box;" value="Alice" /></label>
              <button type="button">Save</button>
            </div>
          } @else {
            <app-detail-placeholder message="Select a boat to edit, or create a new one." />
          }
        </app-detail-pane>
      </app-list-detail-layout>
    </app-page-layout>
  </div>
`;

const meta: Meta = {
  title: 'Shared/ListDetailLayout',
  render: args => ({
    props: args,
    template: demoTemplate,
    moduleMetadata: {
      imports: [PageLayout, Toolbar, ListDetailLayout, ListPane, DetailPane, DetailHeading, DetailPlaceholder],
    },
  }),
};

export default meta;
type Story = StoryObj;

export const WideEmptyDetail: Story = {
  decorators: [layoutProviders(true)],
  args: {
    title: 'Boats',
    showBack: false,
    detailOpen: false,
    listCollapsed: false,
    showForm: false,
  },
};

export const WideWithForm: Story = {
  decorators: [layoutProviders(true)],
  args: {
    title: 'Boats',
    showBack: false,
    detailOpen: true,
    listCollapsed: false,
    showForm: true,
  },
};

export const CompactList: Story = {
  decorators: [layoutProviders(false)],
  args: {
    title: 'Boats',
    showBack: false,
    detailOpen: false,
    listCollapsed: false,
    showForm: false,
  },
};

export const CompactDetail: Story = {
  decorators: [layoutProviders(false)],
  args: {
    title: 'Edit Boat',
    showBack: true,
    detailOpen: true,
    listCollapsed: false,
    showForm: true,
  },
};
