# Page layout recipes

Use these components instead of the `form-page` and `centered-column-page` mixins.

## Recipe 1 — single column (most pages)

Toolbar page with a list **or** a form. Do **not** add `ListDetailLayout`.

```html
<app-page-layout>
  <app-toolbar title="Series" />
  <app-list-pane maxWidth="450px">
    <div listHeader>Search / New</div>
    <!-- list -->
  </app-list-pane>
</app-page-layout>
```

```html
<app-page-layout>
  <app-toolbar title="Club settings" showBack />
  <app-detail-pane maxWidth="350px">
    <app-club-settings-form />
  </app-detail-pane>
</app-page-layout>
```

- `ListPane` replaces `centered-column-page`. Pass `maxWidth` on standalone list pages so the column stays centred.
- `DetailPane` replaces `form-page`. On wide screens the form is framed and centred; on compact screens it is full width.
- The **route** page owns `PageLayout` and the toolbar. Form child components stay forms.

`PageLayout` + an existing custom body is also valid (home, switchboards, manual results).
The `PageLayout` body scrolls vertically when a custom body is taller than the screen; content that
sizes itself to the body (panes, `height: 100%` layouts) keeps its own internal scrolling.

## Recipe 2 — list and detail

For master-detail screens: boats, fleets, seasons, classes and the results viewer.

```html
<app-page-layout>
  <app-toolbar [title]="toolbarTitle()" [showBack]="showBack()" />
  <app-list-detail-layout [detailOpen]="detailOpen()" detailWidth="400px">
    <app-list-pane list>...</app-list-pane>
    <app-detail-pane detail maxWidth="350px" fillHeight>
      <router-outlet />
    </app-detail-pane>
  </app-list-detail-layout>
</app-page-layout>
```

```ts
private readonly detail = listDetailRoute();
readonly detailOpen = this.detail.detailOpen;
readonly showBack = this.detail.showBack;
```

Routes: the page component with children `''` (`DetailPlaceholder` with a `message`), `add` and
`edit/:id`. The add and edit children are detail fragments, not pages, each with a
`DetailHeading`: "Add Boat" for add, and just the item ("ILCA 7 123") for edit.

**When it splits.** List and detail sit side by side whenever the screen is wide enough for both,
whatever the device or orientation: from 720px for form details (`breakpoint="split"`, the
default; tablets in portrait included), from 960px for details that need more room
(`breakpoint="wide"`, the results viewer). Narrower, the list **or** the detail shows and the
toolbar offers Back. `DetailPane` and `DetailHeading` inside the layout follow it; pass the same
breakpoint to `listDetailRoute()` on the page.

- With `detailWidth` (form details), list and detail are centred together with a small gutter, and
  share any shortfall in width. Without it (results viewer), the detail fills the rest of the width.
- `fillHeight` stretches the detail card to the full height.
- The list shows the items only: no edit or delete icons. Selecting an item opens it; delete is a
  `DeleteButton` on the edit detail.

Do not put `ListDetailLayout` on home, login, settings, or a single form.

## Do not wrap

- Entry kiosk (`/entry/kiosk`) — custom full-viewport chrome, no toolbar
- Phone capture (`/results-sheet-phone-capture/...`) — no toolbar
- Nested detail children (`BoatAdd`, `BoatEdit`, `FleetAdd`, `FleetEdit`, `SeasonAdd`,
  `SeasonEdit`, `ClassAdd`, `ClassEdit`) — already inside the parent layout
