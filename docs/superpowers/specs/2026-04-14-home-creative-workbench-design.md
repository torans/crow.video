# Home Creative Workbench Design

**Date:** 2026-04-14

**Goal:** Redesign the desktop home screen into a higher-end creative workbench while preserving the existing three-column workflow and all current business interactions.

## Context

The current home screen works functionally but reads as a loose stack of generic form cards. The main problems are:

- No clear primary stage, even though the left column is the actual creative starting point.
- Similar visual weight across all modules, which flattens hierarchy.
- Excessive empty white space and repetitive rounded panels that make the UI feel cheap.
- Controls are visually scattered inside fields instead of being grouped into intentional toolbars or section headers.

The user explicitly requested:

- Keep working directly on the `main` branch.
- Preserve the three-column information architecture.
- Use a higher-end "creative console" style instead of a settings-page style.
- Treat the **left column as the main stage**.
- Do not mix Chinese and English in visible UI copy unless a term is effectively untranslated, such as a product name, brand name, or unavoidable technical term.

## Design Direction

The redesigned page should feel like a desktop creative tool, not a settings dashboard.

Visual direction:

- Warm light background with subtle depth instead of flat gray-white.
- Sharper information hierarchy using a restrained neutral palette plus one saturated accent.
- Larger, more intentional sectional framing instead of many similar small cards.
- Stronger top-level spacing rhythm, with cleaner internal density.
- Clear distinction between `create`, `browse`, and `execute`.

## Layout Strategy

The three-column layout remains, but the hierarchy changes:

### Left Column: Creative Stage

This becomes the visual and cognitive anchor of the page.

- Merge the product reference, prompt editor, and output copy into one continuous creative workspace.
- Add stronger section headers and lightweight meta labels.
- Make product information feel like source material, prompt area feel like an editor, and output area feel like a result canvas.
- Reduce the appearance of three separate stacked white rectangles.

Expected result:

- The user immediately understands that work starts here.
- The flow from product context to prompt to generated copy reads as a single chain.

### Middle Column: Asset Browser

This remains the secondary workspace.

- Keep folder selection, asset grid, refresh, smart match, and analysis tools.
- Reframe the area as a media library with a clearer top utility bar and cleaner lower action zone.
- Increase emphasis on the asset grid itself, not on surrounding buttons.
- Make status and analysis information feel attached to the library rather than appended below it.

Expected result:

- The asset grid becomes easier to scan.
- Tooling feels operational, not noisy.

### Right Column: Execution Tower

This becomes the narrowest and most focused operational area.

- Keep TTS configuration in the upper portion.
- Keep render status and main execution action in the lower portion.
- Reorganize the render area into a more intentional status panel with clearer stage feedback.
- Remove the feeling of a large empty box with a button floating in the middle.

Expected result:

- The right column supports execution without competing with creation.
- Status, progress, and start/stop actions become easier to read at a glance.

## Component-Level Changes

### `src/views/Home/index.vue`

- Rebalance column widths so the left column reads as the main stage.
- Replace simple percentage height splits with a layout that supports larger creative continuity on the left.
- Add page-level shell styling hooks for richer background and spacing.

### `src/views/Home/components/ProductReference.vue`

- Convert the product module from a plain form card into a richer source-material panel.
- Improve spacing around selector, product summary, image preview, analysis chips, and actions.
- Add clearer empty-state framing if no product is selected.

### `src/views/Home/components/TextGenerate.vue`

- Turn prompt and output into a higher-quality editorial surface.
- Pull language/config/generate controls into a coherent toolbar zone.
- Improve textarea framing so the output area feels like the main writing result, not another default Vuetify field.

### `src/views/Home/components/VideoManage.vue`

- Rework header and action grouping around folder selection and asset operations.
- Improve the visual framing of the media grid.
- Present refresh, smart match, analysis state, and cancel action as one coordinated operational block.

### `src/views/Home/components/TtsControl.vue`

- Tighten layout density and strengthen section identity.
- Make try-listen controls feel like a compact audio console.
- Keep advanced config in dialog, but make visible controls feel more deliberate.

### `src/views/Home/components/VideoRender.vue`

- Rebuild the render area as a proper execution panel.
- Improve status presentation, progress affordance, and main action grouping.
- Keep the config dialog, but reduce the feeling that configuration is the primary action.

### `src/assets/base.scss`

- Replace the current Apple-lite tokens with a more distinctive creative-workbench token set.
- Define stronger panel, canvas, border, highlight, and shadow variables.
- Add shared utility classes for section titles, subtitles, panel chrome, and editor-style surfaces.
- Tune Vuetify defaults so buttons, text fields, selects, chips, switches, and dialogs match the new visual system.

## Interaction Constraints

The redesign must **not** change:

- Existing data flow and business logic.
- Existing dialogs and underlying config persistence behavior.
- Existing action semantics such as analyze, generate, synthesize, render, cancel, and refresh.
- Overall three-column workflow structure.
- The current localization model where visible copy should match the active app language.

The redesign **may** change:

- Visual grouping.
- Surface hierarchy.
- Internal placement of controls within each section.
- Section titles, support text, and decorative framing where this does not require i18n text changes beyond minimal additions.

## Accessibility and Usability Notes

- Maintain clear contrast for interactive controls and status states.
- Preserve keyboard usability of the existing inputs and dialogs.
- Avoid over-styling that harms readability on long output text.
- Ensure desktop-only spacing still behaves reasonably at smaller window sizes.
- Any newly added visible labels, section headings, helper text, or status copy must be localized instead of hard-coded in mixed-language form.

## Testing Expectations

Verification for implementation should cover:

- App boots and home page renders without layout breakage.
- Product selection, prompt editing, text generation, TTS try-listen, asset refresh, asset analysis, and render controls still function.
- Dialogs still open and save config correctly.
- No overflow or clipping in the three-column layout at typical desktop widths.

## Scope Boundary

This redesign is intentionally limited to the home workbench presentation layer. It does not include:

- New workflows.
- New business features.
- Major state-store refactors.
- New data models.
- Navigation redesign beyond the home screen shell.

## Implementation Notes

- Prefer focused template and class refactors over deeper architectural changes.
- Reuse existing components and logic boundaries where possible.
- If a component already contains too much presentational responsibility, small template restructuring is acceptable, but avoid unrelated business refactors.
