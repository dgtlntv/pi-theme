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
npm run web:artifact # multi-file build (web/dist-artifact/) for the Radius artifact
```

Published (organization only): https://radius.earendil.com/artifact/01m39x8k02f4t9mzehw18y4zt6 (republish from `npm run web:artifact` as a new version of that artifact).

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

Proposed tokens are marked in the contract as `"proposed": {"fallback": ...}`: `toolArgument` (falls back to `accent`) and `mdTableBorder` (`text`). In extended, assistant replies, list rows, and typed input use the existing `text` token. The **current** target omits them and checks their rules on the fallback, since that is what Pi renders there today. A rule can be limited with `"targets"` where Pi's behavior differs between the two, such as remapped locations like the session-tree compaction label and direct `!` shell output (extended only). Current Pi's validator ignores unknown color keys, so the extended files also load in today's Pi; they just look like the current output there.

Output: a theme JSON and a `.report.json` per target and mode. On this machine, both generated Pi JSON files are **symlinked** into `~/.pi/agent/themes/` under the same filenames. Pi sees them as `generated-pi-dark` and `generated-pi-light`; select either through `/settings`. To set this up elsewhere, use absolute symlink targets:

```sh
mkdir -p "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes"
ln -s "$(pwd)/generated/generated-pi-dark.json" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes/generated-pi-dark.json"
ln -s "$(pwd)/generated/generated-pi-light.json" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes/generated-pi-light.json"
```

Regeneration updates the symlink targets. Because Pi watches its **themes directory**, changes to files elsewhere via a symlink may not trigger live reload; run `/reload` or restart Pi if the active theme does not update. The reference themes still assume the recipe's terminal background and a derived terminal foreground; measure/pin your actual terminal colors before relying on their contrast report.

## Inputs and algorithm

- **Recipe:** `terminalBackground.dark` and `.light` are the fixed hex anchors. Dark is `#282c34`, Ghostty's installed default (`ghostty +show-config --default`); the light value `#f7f6f6` is only a hypothetical light-terminal anchor, **not** a Ghostty default. Every other role is assigned a color family (constant OKHSL hue and min/max saturation) **without a preferred lightness**. There are no fixed colors: prominent tokens get prominence from higher minimums. As in `../design-tokens`, saturation follows a normalized Gaussian over lightness (peaking at mid lightness, `step` 500 where `step = 1000 × (1 − lightness)`).
- **Contrast contract:** each relationship has one `contrast` value meaning **at least** that WCAG 2.1 ratio. `contrast: null` would explicitly mean no requirement; the current contract has none. The same token can have separate ratios on different surfaces—for example, higher against the terminal background and 4.5 on a tool surface.
- **Selection:** starting from the fixed terminal background, compute surfaces, then foregrounds, then the scrollbar thumb (which depends on the track). For each token, the inverse contrast formulas (WCAG from `wcag-contrast-palette`, APCA from `perceptual-contrast-palette`, extended to the unclipped formula) give the luminance each requirement needs; the strictest wins. That luminance converts to OKHSL lightness with the gray formula, with no correction: exact for grays, while saturated colors can land a few percent off their minimum (worst about 89% in dark mode, overshooting in light mode; at most about ΔE 0.03 from the exact color). Reports list actual ratios, and the CLI prints how many pairs land short; nothing is refused. About 0.6 ms per theme.

Contrast determines lightness, not manually specified step numbers. Different surfaces may cause a pair to exceed its requested ratio: a shared color cannot always achieve every threshold exactly. The report contains each token's lightness step, final hex colors, actual ratios, and pass results.

Tokens are solved in order (surfaces first), so an early surface choice can obstruct a later foreground; such cases relax the contract (see below) rather than search for a different surface.

## Terminal background

`background` is a virtual semantic token, **not a Pi theme JSON field**: Pi themes cannot set the terminal's background. The dark anchor is Ghostty's installed default `#282c34`. `--terminal-bg` overrides the anchor for one mode to generate against a different terminal background; it does not query or change the terminal. Every text color is a theme token (on the Pi branch, text Pi previously left uncolored now uses `text`), so there is no terminal-foreground assumption. `--recipe`, `--contract`, and `--out` accept custom paths. Terminal quantization, ANSI inverse, and extension-provided colors require separate runtime checks.

`userMessageText` and `toolTitle` require 10:1, which lands near white in dark mode (`#f1f1f0`, `#eeeeed`) and near black in light mode. Bash tool commands use `toolTitle`, while result lines use `toolOutput`. Other Markdown spans inside the user bubble (including inline code) use shared Markdown tokens. The user-message and pending/success/error tool fills each require **1.2:1** against the terminal background, **not** against one another. This is a provisional design choice, not WCAG's 3:1 criterion for essential graphical information; color alone still cannot reliably convey tool status.

**Color families.** The six design-tokens families are used as is: cerulean `blue` (user bubble, borders, links, `toolArgument`), coral `red` (errors, removed lines), cream `yellow` (warning, headings, syntax functions), turquoise-green `green` (success, code blocks, added lines), and `neutral` (text, pending-tool fill). Custom families: `violet` (accent, inline code, syntax types, custom-message labels), `orange` (syntax strings), `cyan`, and `purple` (custom-message fill). Thinking borders progress from dull and dark to vivid and light: neutral, slate, blue, periwinkle, violet, magenta, and a fully saturated red (same hue as `red`) for max.

**Footer and `dim`:** `dim` is deliberately tertiary: 3:1 everywhere, including the footer (Pi renders it with `dim`), below readable contrast (`#7d858d`, ~3.7:1 on the dark canvas) and clearly dimmer than `muted` (5:1 minimum). An earlier `footerText` token was dropped once `dim` no longer had to be readable on panels. See [CONTRAST-REQUIREMENTS.md](CONTRAST-REQUIREMENTS.md#visual-hierarchy).

## Code map

- `src/color.ts`: OKHSL bell curve, WCAG and APCA contrast, and their inverse formulas.
- `src/contract.ts`: validate rules and proposed tokens, expand rules into checkable pairs per target.
- `src/recipe.ts`: validate anchor, families, role assignments, and fixed foreground overrides.
- `src/selection.ts`: compute each token's lightness from its requirements, surfaces before foregrounds.
- `src/report.ts`: independently audit final hex colors and build outputs.
- `src/solve.ts`: orchestration; `src/generate.ts`: CLI and file I/O.
- `src/apca-derivation.ts` (CLI: `src/derive-apca-cli.ts`): derive the APCA contract from the WCAG contract and dark theme.
- `src/relax.ts`: best-effort relaxation for backgrounds that cannot meet the contract.
- `validate-contrast-requirements.ts`: standalone contract check, including Pi's 56-color inventory when `../pi` is available.
