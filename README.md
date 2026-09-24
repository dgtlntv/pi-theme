# Pi theme generator

Generate Pi theme JSON from [semantic contrast relationships](contrast-requirements.json) and [color-family recipes](theme-recipe.json). This pass covers Pi's interactive TUI, not HTML export or ANSI palette adaptation. Requires Node.js 24+.

```sh
npm install
npm test                        # typecheck, tests, contract validation
npm run generate                # current + extended themes, dark + light, with reports
```

## Review app

```sh
npm run web          # dev server with hot reload
npm run web:build    # single self-contained file: web/dist/index.html
```

A small Vite + React app (`web/`) that runs the real generator in the browser, so it always matches `npm run generate`. It has two views: a scrollable **catalog** of every reviewable Pi element (messages, Markdown, syntax, all tools in each state, direct shell commands, editor thinking borders, footer states, selectors, settings, session tree, fullscreen search, scrollbar), both inside a terminal-style viewport that scrolls in whole rows and draws Pi's fullscreen scrollbar (`│` track, `┃` thumb, `█` while scrolling) instead of the browser's; and an interactive **session** (shift+tab thinking levels, ctrl+o expand, ctrl+t thinking text, `/settings` `/tree` `/resume` `/model` via slash commands, ctrl+l model, ctrl+f search, escape to close; enter does not send). Controls: terminal background picker (dark or light theme chosen automatically by which of white or black text has more APCA contrast), reset to the dark and light defaults, WCAG/APCA, **Pi current** (Pi's built-in `dark.json`/`light.json` with today's token usage, copied into `web/src/pi-themes/` by `npm run web:pi-themes`) vs **Proposed** (our generated theme with the new tokens and remappings), an optional wiper to compare the two, and an advanced panel for family hue and saturation. The browser-safe generator core imports no Node APIs; file-writing CLIs live in `src/generate.ts` and `src/derive-apca-cli.ts`.

## WCAG and APCA

Every theme is generated twice (`--algorithm WCAG2|APCA|both`, default both):

| Algorithm | Contract | Theme names |
|---|---|---|
| **WCAG 2** | `contrast-requirements.json` (hand-edited source of truth) | `generated-pi[-extended]-{dark,light}` |
| **APCA** | `contrast-requirements.apca.json` (generated, do not edit) | `generated-pi-apca[-extended]-{dark,light}` |

`src/apca-derivation.ts` (CLI: `src/derive-apca-cli.ts`) builds the APCA contract from the WCAG one: it generates the WCAG dark theme, measures each rule's APCA Lc on the pairs it covers, and uses the lowest value, rounded down to a whole number, as that rule's APCA minimum. `npm run generate` re-derives it first, so edit only the WCAG contract. The contract is fully APCA: the spec's low clip reports contrast below about Lc 10 as 0, so the faint surface and scrollbar-track rules are marked `"apcaLowClip": false` and measured with the same formula minus that clip (`src/color.ts` reimplements Color.js's APCA 0.0.98G to allow this; results match Color.js exactly when clipped). Those small values only place faint surfaces and carry no readability meaning.

Result: the APCA dark themes match the WCAG dark themes within OKLab ΔE 0.007 (not perceptible). Light themes differ, because APCA and WCAG 2 disagree about light backgrounds: at the same perceived contrast, APCA light text is lighter than WCAG light text (e.g. `muted` `#7c746d` vs `#5b5650`). APCA is not an adopted standard, so these themes are not a WCAG conformance claim.

## Backgrounds that cannot meet the contract

A mid-range background (e.g. `#555555`) limits the maximum contrast, so some minimums become impossible. Instead of failing, `generateTheme` relaxes the contract as little as needed (`src/relax.ts`), in two stages controlled by one value `t`:

1. `t` 0-1: compress the hierarchy. Minimums above the readable floor (WCAG 4.5, APCA Lc 45) shrink toward it, so text stays brighter than muted, muted brighter than dim, and colors keep their hue.
2. `t` 1-2: give up readability. All minimums shrink toward the lowest value, until each token gets the most contrasting color available.

The report's `relaxation` field records `t` and how many original minimums are unmet, and `checks` list them against the original contract. The CLI prints `RELAXED` for such themes, so they are never mistaken for compliant ones.

## Two targets

One recipe and contract produce two outputs (`--target current|extended|both`, default both):

| Target | Files | For |
|---|---|---|
| **current** | `generated-pi-{dark,light}.json` (56 tokens) | Today's Pi, a theme-only change |
| **extended** | `generated-pi-extended-{dark,light}.json` (59 tokens) | A Pi branch that adds the proposed tokens and remappings |

Proposed tokens are marked in the contract as `"proposed": {"fallback": ...}`: `footerText` (falls back to `dim`), `toolArgument` (`accent`), and `mdTableBorder` (`terminalForeground`, i.e. Pi's `""` terminal default). In extended, assistant replies use the existing `text` token instead of a new one; in current Pi they render in the terminal default, which the contract checks at the same level as `text`. The **current** target omits them and checks their rules on the fallback, since that is what Pi renders there today. A rule can be limited with `"targets"` where Pi's behavior differs between the two, such as the `dim` panel exception (current only) and remapped locations like the session-tree compaction label and direct `!` shell output (extended only). Current Pi's validator ignores unknown color keys, so the extended files also load in today's Pi; they just look like the current output there.

Output: a theme JSON and a `.report.json` per target and mode. On this machine, both generated Pi JSON files are **symlinked** into `~/.pi/agent/themes/` under the same filenames. Pi sees them as `generated-pi-dark` and `generated-pi-light`; select either through `/settings`. To set this up elsewhere, use absolute symlink targets:

```sh
mkdir -p "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes"
ln -s "$(pwd)/generated/generated-pi-dark.json" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes/generated-pi-dark.json"
ln -s "$(pwd)/generated/generated-pi-light.json" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes/generated-pi-light.json"
```

Regeneration updates the symlink targets. Because Pi watches its **themes directory**, changes to files elsewhere via a symlink may not trigger live reload; run `/reload` or restart Pi if the active theme does not update. The reference themes still assume the recipe's terminal background and a derived terminal foreground; measure/pin your actual terminal colors before relying on their contrast report.

## Inputs and algorithm

- **Recipe:** `terminalBackground.dark` and `.light` are the fixed hex anchors. Dark is `#282c34`, Ghostty's installed default (`ghostty +show-config --default`); the light value `#f7f6f6` is only a hypothetical light-terminal anchor, **not** a Ghostty default. Every other role is assigned a color family (constant OKHSL hue and min/max saturation) **without a preferred lightness**. There are no fixed colors: prominent tokens get prominence from higher minimums. `stepInterval` controls search precision, not design preference. Step 0 is white, 1000 black. As in `../design-tokens`, saturation follows a normalized Gaussian centered at step 500; lightness is `1 - step/1000`.
- **Contrast contract:** each relationship has one `contrast` value meaning **at least** that WCAG 2.1 ratio. `contrast: null` explicitly means no requirement, and still appears in reports. The same token can have separate ratios on different surfaces—for example, higher against the terminal background and 4.5 on a tool surface.
- **Selection:** starting from the fixed terminal background, choose surfaces, then foregrounds, then the scrollbar thumb (which depends on the track). Search available steps on the lighter side for dark mode or darker side for light mode. Accept only final **hex** colors that satisfy all currently known required pairs. Of the valid steps, choose the one with the smallest average excess contrast over its applicable ratios. For a token with only `null` requirements, choose the closest *different hex* to the terminal background; it is **not guaranteed to look visibly different**. A final independent pass audits every pair for that target (current: 185 required, 16 explicitly unconstrained; extended: 194 and 11) and refuses to emit a theme on any failure.

Contrast determines palette steps, not manually specified step numbers. Different surfaces may cause a pair to exceed its requested ratio: a shared color cannot always achieve every threshold exactly. The report contains the selected steps, final hex colors, actual ratios, pass results, and a compact palette containing only used steps.

This is a **greedy** solver: an early valid background choice can obstruct a later foreground even if a different background choice would work. Such cases fail explicitly; it does not prove global infeasibility.

## Terminal defaults

`background` and `terminalForeground` are virtual semantic tokens, **not Pi theme JSON fields**. The dark background comes from Ghostty's installed default `#282c34`; Ghostty's default foreground is `#ffffff`. The reference foreground is derived from the contract (`#a8a29c` for the current dark recipe), not automatically read from Ghostty. Pi JSON cannot set either terminal default. For a report checked against Ghostty's actual default foreground, pin it explicitly:

```sh
node src/generate.ts --mode dark --terminal-fg '#ffffff' --out ./verified
```

`--terminal-bg` overrides the recipe anchor for one mode (if your Ghostty configuration differs); `--terminal-fg` pins the measured foreground instead of deriving an assumed one. Neither flag queries or changes the terminal. Infeasible terminal combinations fail rather than weakening ratios. `--recipe`, `--contract`, and `--out` accept custom paths. Terminal quantization, ANSI inverse, and extension-provided colors require separate runtime checks.

`userMessageText` and `toolTitle` require 10:1, which lands near white in dark mode (`#f1f1f0`, `#eeeeed`) and near black in light mode. Bash tool commands use `toolTitle`, while result lines use `toolOutput`. Other Markdown spans inside the user bubble (including inline code) use shared Markdown tokens. The user-message and pending/success/error tool fills each require **1.2:1** against the terminal background, **not** against one another. This is a provisional design choice, not WCAG's 3:1 criterion for essential graphical information; color alone still cannot reliably convey tool status.

**Color families.** The six design-tokens families are used as is: cerulean `blue` (user bubble, borders, links, `toolArgument`), coral `red` (errors, removed lines), cream `yellow` (warning, headings, syntax functions), turquoise-green `green` (success, code blocks, added lines), and `neutral` (text, pending-tool fill). Custom families: `violet` (accent, inline code, syntax types, custom-message labels), `orange` (syntax strings), `cyan`, and `purple` (custom-message fill). Thinking borders progress from dull and dark to vivid and light: neutral, slate, blue, periwinkle, violet, magenta, and a fully saturated red (same hue as `red`) for max.

**Footer and `dim`:** `dim` is deliberately tertiary: 3:1, below readable contrast (`#8a827b`, ~3.7:1 on the dark canvas), clearly dimmer than `muted` (5:1 minimum). The footer uses `footerText` at the same 3:1 level (`#7c746d`). In the **current** target, Pi renders the footer with `dim`, so `dim` has no panel requirement there. See [CONTRAST-REQUIREMENTS.md](CONTRAST-REQUIREMENTS.md#visual-hierarchy).

## Code map

- `src/color.ts`: OKHSL bell curve, Color.js colors and WCAG contrast.
- `src/contract.ts`: validate rules and proposed tokens, expand rules into checkable pairs per target.
- `src/recipe.ts`: validate anchor, families, role assignments, and fixed foreground overrides.
- `src/selection.ts`: derive steps from ratios, backgrounds before foregrounds.
- `src/report.ts`: independently audit final hex colors and build outputs.
- `src/solve.ts`: orchestration; `src/generate.ts`: CLI and file I/O.
- `src/apca-derivation.ts` (CLI: `src/derive-apca-cli.ts`): derive the APCA contract from the WCAG contract and dark theme.
- `src/relax.ts`: best-effort relaxation for backgrounds that cannot meet the contract.
- `validate-contrast-requirements.ts`: standalone contract check, including Pi's 56-color inventory when `../pi` is available.
