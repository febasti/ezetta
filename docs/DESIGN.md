# Design system

The working reference for the look. The source of truth for values is `src/renderer/ui/foundation.css`; for building blocks, `src/renderer/ui/kit/`. If this file and the code disagree, fix this file. The history of each choice is in `docs/DECISIONS.md` (the foundation: 2026-10-18 and 2026-10-19).

## Character

The interface is native macOS: its proportions, its type sizes, its controls, quiet and dense, one size for everyone (there is no density setting). The writing surface is editorial: its own faces, size, line spacing and measure (SPEC 8.3). The two do not mix: no serif in the interface, no interface chrome in the text.

## Values

All in `src/renderer/ui/foundation.css`; nothing else defines a token.

- **Colours by role**, set by every theme (light, dark, sepia): `--color-window`, `--color-sidebar`, `--color-panel`; `--color-label`, `-secondary`, `-tertiary`; `--color-separator`; `--color-control` with `-hover`, `-pressed`, `-raised`; `--color-field`, `--color-field-border`; `--color-accent`, `--color-on-accent`, `--color-selection`, `--color-focus`; `--color-danger`, `--color-warning`, `--color-success`; `--color-mark` (what is marked to check), `--color-danger-ground` (what must still be dealt with), `--color-quote` and `--color-quote-inner` (the faint ground of a quote in the text); `--color-tag-red` … `--color-tag-pink` (the colours of a folder's symbol); `--color-paper` (a page, white in every theme).
- **The accent** is petrol, one hue and chroma in OKLCH (`--accent-hue` 205, `--accent-chroma` 0.075); each theme sets only its lightness. Use it for the main action, focus, links and references, and what is chosen; never as decoration.
- **Shadows**: `--shadow-float` (what floats: popovers, dialogs, menus, toasts), `--shadow-raised` (a chosen segment, a switch's knob), `--shadow-paper` (a page on its desk).
- **Spacing**: `--sp-4`, `--sp-8`, `--sp-12`, `--sp-16`, `--sp-24`, `--sp-32`. Nothing else (1 and 2 px only to correct a hairline).
- **Radii**: `--r-sm` 4 (fields, tags), `--r-md` 6 (buttons, rows), `--r-lg` 10 (popovers, dialogs).
- **Type roles**, each a whole `font`: `--type-large-title` 22/28 bold, `--type-title` 15/20 semibold, `--type-emphasis` 13/18 semibold, `--type-body` 13/18, `--type-caption` 11/14. A component picks a role, never a size or a weight.
- **Sizes**: controls `--control-sm` 22 (bars, dense lists), `--control-md` 28 (default), `--control-lg` 32 (the main action of a dialog); rows `--row-single` 28, `--row-double` 44; insets `--inset-pane` 16, `--inset-dialog` 20; `--form-label-width` 120; bars `--bar-height` 44, `--titlebar-height` 48, `--statusbar-height` 28.
- **Faces**: `--font-ui` (the system's: San Francisco on macOS, the bundled Inter where there is none); on the writing surface `--font-writing`, `--text-writing`, `--line-writing` (the writer's choice, set by `ui/typography.svelte.ts`) and `--measure-writing` (the writer's choice, 760 by default: about 74 characters); `--font-mono`. All fonts are bundled.
- **Layers**: `--z-popover`, `--z-modal`, `--z-confirm` (an Alert over a dialog).
- **Motion**: one `--duration` 120 ms (none under reduced motion). **Focus**: one ring, a 3 px halo in `--color-focus` (`box-shadow: 0 0 0 3px var(--color-focus)`).

## Building blocks

`src/renderer/ui/kit/`, each shown in all its states in the gallery (`npm run gallery`):

Button (primary, secondary, plain, danger; sm, md, lg), IconButton (sm, md; `pressed`, `expanded`), ToolbarButton (a tool in a bar), TextField (one-way: `value` shown, `onvalue` reports typing), Select (the system's pop-up button), Checkbox, Switch (a setting that applies at once), Segmented (labels, icons or a sample such as "Aa"), ChoiceCards (a few options as compact cards with an icon, such as the theme), NumberField (one number in a range, with arrow buttons and keys that step it), RadioList (choices that need a word of explanation), Tabs, ListRow (one anatomy: leading icon, title, optional subtitle, accessory), Form and FormRow (labels right-aligned left of the controls, or stacked), Section (heading, content, a hairline before the next), Dialog (one header: title, optional action, × at the far right; body; optional footer with the main button last; narrow, medium, wide, workspace), Alert (a small question above everything), Popover, Callout (the only grey box), EmptyState, Chip (a fact as a tag), FilterChip, Meter, KeyValues, Link (a way to a place in the text).

**The DOM kit** (`src/renderer/ui/kit/dom.css`): what the editor draws inside CodeMirror is plain DOM and cannot use Svelte blocks, so the same looks exist as classes: `k-popover` (with `k-bar` for a row of tools and `k-bar-group`), `k-button` (`-primary`, `-plain`, `-danger`, `-sm`), `k-icon-button` (`-sm`; `aria-pressed`, `aria-checked`), `k-field` (`-multiline`), `k-segmented` (`-sm`), `k-row` (`active`). A change to a block changes its DOM twin too. CodeMirror's own parts (the `@` menu) are styled in the editor's theme (`editor/theme.ts`), which outranks CodeMirror's.

## Rules

1. A screen is made of building blocks. It has CSS only for its own layout (where blocks go), never for how a control or a row looks.
2. Grouping is done with sections and hairlines, never with cards or boxes. A grey box (Callout) is only for what stands apart. Deliberate exceptions: the sheet cards in the sidebar and the badge in the corner of the text (status and words as chips on a translucent ground).
3. Rows do not light up under the pointer; the chosen row has the selection's ground. Buttons and fields show hover and pressed states.
4. One main action per dialog or view, and it is the only `primary` button there. A dialog's buttons are at the right of its footer, the main one last; the × closes it.
5. A new need (a colour, a size, a block) goes into the foundation first, with a reason in `docs/DECISIONS.md`, and is then used.

## Enforcement

- `npm run lint`: a feature (`src/renderer/features`) does not draw its own `button`, `input`, `select` or `textarea`. A control the kit has no block for (a colour swatch, the grid of symbols, a template's picture) carries a disable comment that says why.
- `npm run check:design` (part of `npm run check`): the styles read only foundation tokens (or ones set at run time), write no colour values, and keep padding, margin and gap on the spacing scale.
- `npm run test:gallery`: screenshot tests of the gallery in every theme (`tests/gallery`), in Electron's own Chromium. When a change of look is meant, run `npm run test:gallery -- -u`, look at the new pictures, and commit them with the change.
- Nothing is global except the foundation, the DOM kit and the styles of the editor's widgets (`ui/*.css`): every component styles only itself, so a class name never picks up a style from elsewhere.

## The app's own conventions

- On macOS the title bar is the toolbar: the traffic lights take `--chrome-inset` (90 px, none in full screen) at its left, its empty space moves the window (`-webkit-app-region: drag`), and buttons, fields and everything that floats are `no-drag`. A new control in the toolbar is a `button`, `select` or `input`, so it stays clickable.
- Labels stay visible, except in the toolbar: universal icons stand alone, a name sits beside the icon only for Beleg, Querverweis and Fußnote, and every tool has its name as tooltip and for screen readers.
- One icon set: Tabler (outline), named by meaning in `src/renderer/ui/Icon.svelte` (the editor's DOM uses `editor/icons.ts`). Add an icon there, nowhere else.
- All visible text goes through the i18n layer. A count says its noun in the right form: `{count, plural, one {# Abschnitt} other {# Abschnitte}}`; never "{count} Abschnitte".
- Space around block widgets in the editor is padding, never margin (CodeMirror ignores margins).
- In the text, every citation is set at the size and weight of the text around it; a citation in brackets (the normal and the year form) is a pill in the accent on a pale ground, about half the selection's (the selection's full ground on hover); a citation that is part of the sentence (the prose and the author form, "Smith (2020) zeigt") is text in its own colour with a solid 2 px underline in the accent; a cross-reference is accent text with a dotted underline, so none is mistaken for another. A chosen chip has a 2 px accent ring. To check: the mark's ground and a flag; missing: a dashed outline in the danger colour (a dashed underline for a citation in the sentence); "Beleg fehlt": the danger ground.
- The status of a sheet is a dot in its role colour: draft tertiary, revised warning, final success.
- Context menus are the system's own; the app's menu (`ui/MenuHost.svelte`) is drawn as the system's where a native one cannot be used, and is what the dropdowns under the tools use. In it the chosen item (an item with `checked`) has the selection's ground and `aria-current`, not a check mark; the item under the pointer or the keys is in the accent, and none is when the menu opens.
- Check umlauts, ß, italics, small caps, tabular figures and footnote numerals when an element that uses them arrives.
