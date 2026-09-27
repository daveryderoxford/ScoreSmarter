# Page layout recipes

Use these components instead of the `form-page` and `centered-column-page` mixins.

## Recipe 1 — single column (most pages)

Toolbar page with a list **or** a form. Do **not** add `ListDetailLayout`.

```html
<app-page-layout>
  <app-toolbar title="Classes" />
  <app-list-pane maxWidth="450px">
    <div listHeader>Search / New</div>
    <!-- list -->
  </app-list-pane>
</app-page-layout>
```

```html
<app-page-layout>
  <app-toolbar title="Add Class" showBack />
  <app-detail-pane maxWidth="350px">
    <app-class-form />
  </app-detail-pane>
</app-page-layout>
```

- `ListPane` replaces `centered-column-page`. Pass `maxWidth` on standalone list pages so the column stays centred.
- `DetailPane` replaces `form-page`. On wide screens the form is framed and centred; on compact screens it is full width.
- The **route** page owns `PageLayout` and the toolbar. Form child components stay forms.

`PageLayout` + an existing custom body is also valid (home, switchboards, manual results).

## Recipe 2 — list and detail

Only for true master-detail screens (boats, fleets, results viewer).

```html
<app-page-layout>
  <app-toolbar />
  <app-list-detail-layout [detailOpen]="detailOpen()">
    <app-list-pane list>...</app-list-pane>
    <app-detail-pane detail>
      <router-outlet />
    </app-detail-pane>
  </app-list-detail-layout>
</app-page-layout>
```

Wide: list and detail side by side. Compact: list **or** detail.

Do not put `ListDetailLayout` on home, login, settings, or a single form.

## Do not wrap

- Entry kiosk (`/entry/kiosk`) — custom full-viewport chrome, no toolbar
- Phone capture (`/results-sheet-phone-capture/...`) — no toolbar
- Nested detail children (`BoatAdd`, `BoatEdit`, `FleetAdd`, `FleetEdit`) — already inside the parent layout

Classes and seasons stay list-then-full-page-form (recipe 1). They are not boats-style split screens.
