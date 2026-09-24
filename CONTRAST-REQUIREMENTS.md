# Pi TUI contrast requirements — proposal for review

Scope: the first-party interactive terminal UI in `../pi` at commit `d201760ff`; **HTML export is out of scope**. The machine-readable source of truth is [`contrast-requirements.json`](contrast-requirements.json). This document records usage and rationale; [README.md](README.md) explains the generator. Run `node validate-contrast-requirements.ts` to check coverage, explicitly unconstrained pairs, and Pi's token inventory.

## Method and levels

WCAG contrast for rendered sRGB: `(Llighter + .05)/(Ldarker + .05)`, with relative luminance `0.2126R + 0.7152G + 0.0722B` after sRGB linearization. The contract defines a **single required ratio (`contrast`) per pair**, interpreted as *at least* that value, or `null` for no requirement. Readable text generally requires ≥4.5; only the `text` role requires ≥7. `dim` is deliberately tertiary at 3:1 everywhere. `muted` continues to require 4.5 on all its surfaces. Message/tool backgrounds provisionally use 1.2:1 against the canvas. Essential non-text indicators may still require 3; decorative differences have `null`. Meaningful tiny glyphs, code punctuation, and diff `+`/`-` are text.

`D` = terminal's **actual** default background (the JSON's virtual semantic token `background`); `F` = terminal's actual default foreground (the JSON's virtual `terminalForeground`); `U=userMessageBg`, `C=customMessageBg`, `P=toolPendingBg`, `G=toolSuccessBg`, `R=toolErrorBg`, `S=selectedBg`, `Q=searchMatchBg`; `T={P,G,R}`. The TUI does not supply D or F. The theme value `""` requests a terminal default, and ANSI 0–15 indices depend on the terminal; these pairs cannot be certified from JSON alone. Validate real colors after quantization, ANSI inverse, and terminal overrides. Text inside a colored box must be checked on that box even when its foreground color is set elsewhere.

## Inventory and foreground/background pairs

Pi's theme schema and class define **56 semantic slots: 49 foreground + 7 backgrounds**. The structured contract adds two virtual roles (`background`, `terminalForeground`), giving 58 tokens. All seven Pi backgrounds have an explicit relationship to `background`, including those with `contrast: null` (deliberately no contrast requirement). The contract also records other no-requirement pairs such as search-match fill against possible underlying surfaces and tool-state fills against one another. Optional fallbacks: `scrollbarTrack→muted`, `scrollbarThumb→text`, `searchMatchBg→selectedBg`, `searchMatchText→text`, `thinkingMax→thinkingXhigh` (`theme.ts:262-274`). Theme `vars` are aliases rather than extra semantic slots. Sources: `theme/theme-json.ts`, `theme/theme.ts`, first-party interactive components, `core/tools/renderers/`, and `packages/tui/src/components/markdown.ts`.

In this table, **each surface listed is a distinct pair with the named token**. `M` = D, U, C for Markdown wherever rendered; `K` = D, U, C, T for code/syntax wherever rendered. The structured contract is authoritative for each pair: only `text` is assigned 7, most readable text uses 4.5, and `dim` on non-canvas surfaces explicitly has no requirement. Non-text rows distinguish necessary indicators from decorative ones.

| Foreground tokens (all 49) | Actual uses | Surfaces | Requirement |
|---|---|---|---|
| `text` | Primary UI copy, setup/settings, mermaid, fullscreen jump label; assistant replies in extended | D, S | ≥11 on D, ≥9 on S |
| `accent` | Active choices/cursors, paths, links, tree roles, mermaid | D, S, T | ≥4.5 everywhere; may still look pale when shared with tool panels |
| `success`, `error`, `warning` | Status/error/warning copy and labels, including selected tree/session rows and tool results | D, S, T | ≥4.5 throughout |
| `muted` | Readable descriptions, timestamps, tool hints/output, list descriptions | D, S, C, T | ≥5 (readable secondary text, one level above `dim`) |
| `dim` | **Footer** cwd and usage/model lines (`footer.ts:227-232`), plus hints/metadata, settings descriptions, tree labels and connectors | D, S, C, T when used | ≥3 on D/S/C/T; intentionally below the 4.5 readable-text level |
| `thinkingText` | Assistant thinking/collapsed text | D | Text ≥4.5 |
| `userMessageText` | Default user Markdown body | U | ≥10: very prominent, near white in dark mode and near black in light mode |
| `customMessageText`, `customMessageLabel` | Custom/skill/summary bodies and identifying labels; skill text also appears in a tool renderer | C, T when used | ≥4.5 |
| `toolTitle` | Tool names/headers (including the bash-tool command) and fallback renderer; distinct from result token `toolOutput` | T | ≥10: very prominent, near white in dark mode and near black in light mode |
| `toolOutput` | Tool results/commands, image fallback | T | ≥4.5 |
| `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdQuote` | Markdown headings, links/URLs, inline/fenced code, quotes, including user/custom Markdown | M; T when tool content is Markdown | ≥4.5 throughout |
| `mdCodeBlockBorder`, `mdQuoteBorder`, `mdHr`, `mdListBullet` | Code fences, quote bar, horizontal rule, list marker | M; T when used | Fences and bullets ≥4.5 as text; quote bar and rule ≥5, the `muted` level as in Pi's default theme |
| `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext` | Readable diff lines and edit previews; inverse-highlighted changed words | D, T | ≥4.5. Test inverse as **actual swapped colors** |
| `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation` | cli-highlight in Markdown code and tool read/write renderers | K | ≥4.5 throughout |
| `border`, `borderAccent`, `borderMuted` | Dialog/editor borders; `borderAccent` also the tree compaction label in current Pi | D, S when tree text | `borderMuted` (editor) ≥3; `border` and `borderAccent` ≥4.5, same level with different color. Current Pi only: compaction label text ≥4.5 |
| `scrollbarTrack`, `scrollbarThumb` | Chat viewport scrollbar characters | D; thumb against track | Track ≥1.7 on D (faint, like Pi's default); thumb ≥3 against track |
| `searchMatchText` | Fullscreen search-match glyphs | Q | ≥4.5 |
| `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `thinkingMax` | Editor border for thinking level, via `getThinkingBorderColor` | D | Increasing prominence: 3, 3.25, 3.5, 3.75, 4.25, 4.75, 5. The top stays near 5 so max can be a saturated mid-lightness red rather than a pale pink. Level is also shown as text |
| `bashMode` | Editor border **and readable** `$ command` header in bash execution | D | Header ≥4.5; necessary editor boundary ≥3 |

`userMessageText` and `customMessageText` are default Markdown colors overridden by nested Markdown spans (`user-message.ts:40-51`, `custom-message.ts:92-110`); **all nested Markdown tokens need checking on U/C too**. `mdCodeBlock` also renders unhighlighted code. A separate `BashExecutionComponent` renders on D, not G (`bash-execution.ts:138-163`). Extension-provided custom renderers may use arbitrary ANSI and cannot be guaranteed by the 56 first-party slots.

## Visual hierarchy

Minimums alone let the solver place many tokens at the same color, because it picks the least contrast that satisfies every pair. Each intended level therefore has its own minimum, and `null` is reserved for pairs that genuinely need no visibility (the solver places those as close to the background as possible).

| Level | Tokens | Minimum on D |
|---|---|---|
| Primary text | `text` (and assistant replies) | 11 (9 on selected rows) |
| Secondary text | `muted`, `mdHr`, `mdQuoteBorder` | 5 (≈6.1 in practice: also 5 on panels) |
| Tertiary text | `dim` | 3 (≈3.7 in practice: also 3 on panels). Deliberately below readable contrast: footer, key-hint descriptions, tree connectors, settings descriptions |
| Thinking text | `thinkingText` | 4.5 |
| Borders | `border` = `borderAccent` > `borderMuted` | 4.5 / 3 |
| Thinking borders | off → max | 3 → 5 |
| Faint marks and surfaces | `scrollbarTrack`; panels and selection | 1.7; 1.2 |

## Proposed tokens and remappings (extended target)

These are proposals for a Pi branch, not current Pi slots. Each is optional; its fallback is what Pi renders today, so existing themes are unchanged.

| Token | Fallback | Where | Requirement |
|---|---|---|---|
| `toolArgument` | `accent` | Tool paths, grep/find patterns, compact read labels (`render-utils.ts:84`, `grep.ts:30`, `find.ts:26`, `read.ts:106`) | ≥4.5 on T |
| `mdTableBorder` | unstyled (terminal default) | Markdown table grid (`markdown.ts` `renderTable`), via a new optional `MarkdownTheme` hook | ≥3 on D/U/C |

Remappings in the extended target: session-tree compaction label `borderAccent` → `customMessageLabel`; key hints key `dim` → `muted` and description `muted` → `dim`; read-tool expand hint `dim` → `muted`; direct `!` shell output `muted` → `toolOutput` on D; fullscreen-search placeholder and count raw faint → `muted`. List and row text that Pi left unstyled (terminal default) → `text`: select-list and settings labels, model and scoped-model ids, session names, tree entry content, user-message selector, config selector (via a new optional `itemText` in pi-tui's `SelectListTheme`). `borderAccent` is then a border only: &ge;3 on D, like `border` and `borderMuted`.

## Background-to-background requirements — provisional decisions

| Background | TUI use | Recommendation |
|---|---|---|
| `userMessageBg` | User chat bubble with no explicit `user:` speaker label; distinct cool-blue family from pending-tool blue | **Provisional U vs D ≥1.2:1**, to avoid an overly strong panel; readable text on U still ≥4.5. This is weaker than WCAG's 3:1 non-text criterion if the bubble is essential for identifying the speaker |
| `selectedBg` | Selected session/tree rows; fullscreen jump indicator | Subtle fill ≥1.2 vs D, like other panels; cursor/bold also mark selection. Foreground on S ≥4.5 |
| `searchMatchBg` | Fullscreen matches | ≥1.25 vs D, close to Pi's default (~1.26); no requirement against other surfaces. Other matches are underlined; the current match is reversed and bold. `searchMatchText` on Q ≥4.5 |
| `customMessageBg` | Custom/skill/summary bubbles with explicit type labels | Subtle panel ≥1.2 vs D, like other message panels; labels carry identity; text on C ≥4.5 |
| `toolPendingBg`, `toolSuccessBg`, `toolErrorBg` | Tool execution/preview states | **Provisional P/G/R vs D ≥1.2:1**, including success; no pairwise tool-state requirement. Readable foregrounds on P/G/R still ≥4.5. Color-only status remains an accessibility concern |

These **1.2:1 design ratios** are a provisional aesthetic choice, not a claim of WCAG 1.4.11 conformance for essential graphical distinctions. `FooterComponent.render` applies `theme.fg("dim", ...)` to the cwd and stats/model line (`footer.ts:224-232`); context percentage may instead use `warning`/`error` above 70%/90% (`footer.ts:156-163`). The **explicitly unconstrained** `dim` relationships on selected/custom/tool backgrounds let the footer reach ~4.56:1 on D (`#99928b`), below the main `text` at ~7.10:1. The cost is that the same `dim` on a success-tool panel reaches only ~3.80:1: its readable hints may fail WCAG text contrast. Tool-status color alone may also fail WCAG 1.4.1. `customMessageBg` remains decorative; its label carries identity.

## Pair-generation implemented

[`theme-recipe.json`](theme-recipe.json) defines color-family hues and saturation ranges and anchors the dark background to Ghostty's installed default `#282c34`; its light anchor is hypothetical, not Ghostty's default. **It contains no preferred lightness steps.** [`src/solve.ts`](src/solve.ts) coordinates relationship expansion, contrast-derived step selection, and final checks; implementation is in `contract.ts`, `selection.ts`, and `report.ts`. The CLI writes Pi themes and pair-by-pair reports. The checks below describe what is modeled:

1. Expand each rule into `(fg, rendered bg, required contrast or null)` pairs. Also include **unstyled F** on D/U/C/T/S where the terminal default foreground is inherited (e.g. selected-row body or generic tool arguments/results). It must pass ≥4.5 for readable content. Do not invent combinations that never render.
2. On S, test at least F, `text`, `accent`, `dim`, `muted`, `warning`, `error`, `success`, `customMessageLabel`, `borderAccent` (session/tree rows). On Q, test `searchMatchText`. On U/C, include nested Markdown and syntax roles, not only their default body-text token. On T, include F, tool names/output, `muted`, explicitly unconstrained `dim`, `accent`, `error`, `warning`, custom skill tokens, diffs, code/syntax roles, where used.
3. Add provisional non-text pairs `U:D`, `P:D`, `G:D`, `R:D` ≥1.2 (necessary borders and scrollbar distinctions remain ≥3). Do not invent pairwise requirements among the three tool backgrounds. Test terminal default colors and reduced-color modes in the *actual* terminal. Neither `""` nor ANSI indices 0–15 provide portable RGB values in Pi theme JSON.

**Current decisions:** user bubble and all three tool-state fills provisionally ≥1.2 against D, with **no extra cues** in this pass. Selected/search fills need not reach 3 because they have other indicators. Secondary text requires 4.5. HTML export is deferred. The tool-status color-only limitation is explicitly acknowledged for later review.
