# Decision: Phase 1 UI Semantic Model — Stage Badges

**Author:** Verbal | **Date:** 2026-02-28  
**Status:** Implemented | **Scope:** Frontend only

## What Changed

Implemented Phase 1 of the UI Semantic Model (docs/ui-semantic-model.md Section 10.1):

- **Nav tab renamed** from "Meetings" to "Events" (page header too)
- **Stage column** replaces the visual Status column on the Events page
- **`resolveStage()` function** computes lifecycle stage client-side from existing event properties
- **Stage badges** with 6 color-coded states: Scheduled, Held, Processing, Transcribed, Not Held, Cancelled

## Design Decisions

1. **Kept `data-sort="status"` on the Stage column** — sorting uses the raw backend status field, not the computed stage. This keeps sorting functional without adding complexity.
2. **Did NOT touch the Overview page's "Recent Meetings" section** — it still uses status-badge. Phase 2 can unify this.
3. **Stage is computed client-side only** — no new backend field. If the team wants server-side stage computation later, that's a separate decision.
4. **"Processing" label for `transcribing` stage** — per spec, the user-facing label avoids the technical term "transcribing."

## What's Left for Phase 2+

- Merge Meetings + Transcripts into a single unified Events view
- Update Overview page to use stage badges
- Add stage-based filtering (replace or supplement status filter)
- Server-side stage computation if needed for filtering/sorting
