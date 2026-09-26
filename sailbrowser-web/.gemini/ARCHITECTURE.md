# Sailing Results App: Architecture & Rules

## Project Scope
- **Angular Web:** (this dir) Result recording and public viewing.
- **Dart Mobile:** On-water timing capture.
- **Backend:** Firebase (Firestore, Auth, Cloud Functions).

## Angular Directory & Naming (2025 Standards)
- **Structure:** `shared/`, `auth/`, and Feature Directories.
- **Features:** Use directories `model` (entities), `services` (business logic), and `presentation' (view components).  
- **Imports:** Use barrel file 'index.ts' to expose feature public interface.  Use relative path within features.  Use 'index.ts' to access files from outside the feature.
- **NO SUFFIXES:** Do not use `.component` or `.service` in filenames.
- **Component Naming:** `entity-page`, `entity-add`, `entity-form`, `entity-details`, `entity-dialog`.
- **Atomic Naming:** Include control type in name (e.g., `submit-button.ts`).

## State & Data Flow
- **State:** Global state in `@store/` services. Local state in components.
- **Communication:** All Firebase logic resides in `services` using `AngularFire`.
- **Mapping:** Use `dataObjectConverter` (interfaces) or `classInstanceConverter` (classes with constructors).
- **Async Pattern:** Always use `try/catch/finally` with a `busy` signal for UI spinners.

## Domain Model & Scoring
- **Boat:** Identified by `boatClass`, `sailNumber`, `helm`. No strict referential integrity with `RaceCompetitor`.
- **Two-Stage Results:**
  1. **Provisional:** Real-time feedback via `RaceCompetitor` methods.
  2. **Published:** Finalized by Cloud Function into `PublishedRaceResult` document (ID = `raceId`).
- **Timing:** Durations stored as **seconds**. Display via `DurationPipe`.
- **Scoring Types:** Level Rating, Handicap (RYA PY/Personal), and Pursuit.
- **Series Rules:** ISAF 2017 Short/Long Series.

## Technical Standards
- **Testing:** `vitest` + Angular Testing Framework mocks. Files: `.spec.ts` next to source.
- **UI:** Angular Material 3. Use Design Tokens (`--mat-sys-...`) and `mat-overrides`.
- **Layout:** Use `app-page-layout` with `app-toolbar`. Single-column pages use `app-list-pane` or `app-detail-pane`. Master-detail (boats, fleets, results viewer) uses `app-list-detail-layout`. See `src/app/shared/layout/LAYOUT.md`.
- **Dates:** Use `date-fns` for math.


