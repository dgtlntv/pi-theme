# Pi theme generator

Generates Pi themes for the interactive TUI from [contrast requirements](contrast-requirements.json) and [color families](theme-recipe.json). Every color's lightness is computed from its contrast minimums against the terminal background; there are no fixed colors or preferred lightness steps. No dependencies; requires Node.js 24+.

```sh
npm install
npm test          # typecheck and tests
npm run generate  # all eight themes into generated/
node src/generate.ts --mode dark --terminal-bg '#1e1e2e'   # against another terminal background
```

## Inputs

- **`contrast-requirements.json`**: each rule says `token` must reach at least a minimum on each of its `backgrounds` (`background` is the terminal background). Minimums are given per mode as `{"wcag": ratio, "perceptual": contrast}` under `dark` and/or `light`; a missing mode uses the other's. Perceptual contrast needs different light-mode values for the same perceived weight, so most rules set both. Optional: `targets` (limit to `current` or `extended`), `note`. `proposed` lists tokens Pi does not support yet, with the token Pi renders instead.
- **`theme-recipe.json`**: the terminal background for each mode (dark: Ghostty's default `#282c34`; light: a hypothetical `#f7f6f6`), OKHSL color families (hue and saturation range; saturation peaks at mid lightness, as in `../design-tokens`), and which family each token uses.

## How colors are computed

Tokens are solved in dependency order: each after the backgrounds it is measured on. For each token, the inverse contrast formulas give the luminance every rule needs, and the strictest wins. That luminance converts to OKHSL lightness with the formula for grays: exact for grays, while saturated colors land a few percent off their minimum (at most about ΔE 0.03). About 0.6 ms per theme.

A mid-range background (e.g. `#777777`) cannot reach every minimum. The generator then relaxes the contract as little as needed: first minimums above the readable floor (WCAG 4.5, perceptual 45) shrink toward it, keeping the hierarchy; then all minimums shrink toward the lowest value. The CLI prints `RELAXED` with the amount.

## Outputs

| Theme | Contract | Target |
|---|---|---|
| `generated-pi-{dark,light}` | WCAG 2 | current: today's 56 Pi tokens |
| `generated-pi-extended-{dark,light}` | WCAG 2 | extended: adds the proposed tokens (Pi branch `theme-token-improvements`) |
| `generated-pi-perceptual[-extended]-{dark,light}` | Perceptual | same two targets |

In `current`, a proposed token's rules apply to its fallback, since that is the color Pi renders there. The perceptual formula's low clip reports contrast below about 10 as 0, so perceptual minimums below 15 (faint panels, the scrollbar track) are measured without it.

The generated files are symlinked into `~/.pi/agent/themes/`; select them in `/settings`. Pi themes cannot set the terminal background, so the themes assume the recipe's background unless generated with `--terminal-bg`.

## Review app

```sh
npm run web          # dev server
npm run web:build    # single file: web/dist/index.html
npm run web:artifact # multi-file build for the Radius artifact
```

A Vite + React app that runs the generator in the browser: a catalog of Pi's UI elements and an interactive session, with a background picker (dark or light chosen by perceptual contrast), WCAG or perceptual contrast, Pi's built-in theme (`npm run web:pi-themes` copies it from `../pi`) versus the proposed theme, and a family editor. Published (organization only): https://radius.earendil.com/artifact/01m39x8k02f4t9mzehw18y4zt6

## Code

- `src/color.ts`: OKHSL to sRGB, WCAG 2 and perceptual contrast, and their inverses.
- `src/contract.ts`: validate the contract and recipe; expand rules into pairs per algorithm, target, and mode.
- `src/solve.ts`: compute colors, relax impossible backgrounds, build themes.
- `src/generate.ts`: CLI.
