# Scoring Logic & Fleet Management Specification

This document outlines the refined logical model for managing fleets, series, and race scoring in the ScoreSmarter system. The goal is to simplify configuration, prevent logical errors, and provide a transparent workflow for Race Officers (ROs).

---

## 1. Series-Level Invariants

The **Fleet Definition** of a series dictates its **Primary Scoring Mode** and the **Allowed Race Types**.

| Series Type | Fleet Requirement | Primary Scoring Mode | Allowed Race Types |
| :--- | :--- | :--- | :--- |
| **One-Design** | **Boat Class** (e.g., ILCA 6) | **Level Rating** (Position) | Level Rating |
| **Mixed-Fleet** | **Handicap Range** or **General Handicap** | **Corrected Time** (Scheme) | Handicap (Time), Pursuit (Position) |

### Key Rules:
*   **General Handicap:** Replaces the ambiguous "All competitors" fleet. It explicitly links a mixed fleet to a scoring scheme (e.g., "General Handicap").
*   **Tag-based Fleets:** Restricted to **Secondary Scoring** only (e.g., a "Junior" or "Novice" prize within a larger series). They cannot be the primary fleet for a series.
*   **Scoring Mode Locking:** Selecting a fleet type automatically locks or defaults the series' scoring mode to prevent mismatches (e.g., a Boat Class fleet cannot be scored using a handicap scheme).

---

## 2. Race Types & Data Entry

The system supports three primary race types, each with a specific data entry requirement:

1.  **Level Rating:** Results are based on finish position. (Standard start).
2.  **Handicap:** Results are based on finish times corrected by a handicap scheme. (Standard start).
3.  **Pursuit:** Results are based on finish position. The handicap is applied at the start via staggered times calculated externally.

---

## 3. The "Dynamic Scoring Sheet" Workflow

The Race Officer (RO) manages shared starts dynamically at the point of result entry, decoupling logistics from series configuration.

### Multi-Race Selection
The RO can select one or more races from the calendar to score together (e.g., "ILCA 4 Race 1", "ILCA 6 Race 1", and "ILCA 7 Race 1").

### Unified Entry Mode (The "No-Mix" Rule)
To maintain a clean and functional UI, all competitors on a single scoring sheet **must share the same data entry mode** (either **Time-based** or **Position-based**).

*   **Compatibility Rules:**
    *   **Time-based Sheet:** Can host **Handicap** and **Level Rating** races. (Positions for Level Rating are derived from times).
    *   **Position-based Sheet:** Can host **Pursuit** and **Level Rating** races.
    *   **No Mixing:** A **Pursuit Race** (Position) and a **Handicap Race** (Time) **cannot** be scored on the same sheet simultaneously.

### Intelligent Result Routing
When a sail number is entered on a multi-race sheet, the system automatically "pushes" the result into the correct Series/Race based on the boat's fleet eligibility.

---

## 4. Interface Implications

### Series Setup
*   Rename "All competitors" to "General Handicap".
*   Implement logic to lock/default the scoring method based on the selected fleet.
*   Restrict "Tag" fleets to a "Secondary Scoring" section.

### Race Setup
*   Filter available "Race Type" options based on the parent series' scoring mode.

### Manual Results Page
*   Enable multi-selection of races from the calendar.
*   Enforce the "Unified Entry Mode" by detecting compatibility between selected races.
*   Provide a clear indication of the active entry mode (Time vs. Position).
