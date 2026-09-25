/**
 * Pi TUI elements, mirroring ../pi components and their token usage.
 *
 * @module
 */
import type { ReactNode } from "react";
import { C, Gap, KeyHint, Line, Panel, Rule } from "./term.tsx";

/** Pi's thinking levels, in order. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** A thinking level. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/**
 * Name the editor border token of a thinking level.
 *
 * @param level - The thinking level.
 * @returns The token, like `thinkingHigh`.
 */
export const thinkingToken = (level: ThinkingLevel) => `thinking${level[0].toUpperCase()}${level.slice(1)}`;

// ---------------------------------------------------------------- header, status

/** The Pi logo's fixed brand colors (not theme tokens). */
const LOGO_COLORS = { R: "#f09082", B: "#4d9abf", Y: "#f1be58" } as const;

/**
 * The Pi logo as a 4×4 pixel grid, keyed by {@link LOGO_COLORS}. Pi draws it with half
 * blocks in 4×2 cells (components/pi-logo.ts); here each pixel is a 1ch × half-row box,
 * which renders the same without glyph seams.
 */
const LOGO_GRID = ["RRR.", "B.R.", "BB.Y", "B..Y"];

/**
 * One cell row of the Pi logo.
 *
 * @param props - The row, 0 or 1.
 * @returns The row.
 */
export function PiLogoRow({ row }: { row: 0 | 1 }) {
  return (
    <span className="pi-logo" title="Pi logo (fixed brand colors)">
      {[0, 1, 2, 3].map((col) => (
        <span key={col} className="pi-logo-cell">
          {[LOGO_GRID[row * 2][col], LOGO_GRID[row * 2 + 1][col]].map((pixel, half) => (
            <span key={half} style={{ background: pixel === "." ? undefined : LOGO_COLORS[pixel as keyof typeof LOGO_COLORS] }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The startup header's compact key hints. */
const COMPACT_HINTS = (
  <>
    <KeyHint k="escape" d="interrupt" /><C t="muted"> · </C><KeyHint k="ctrl+c/ctrl+d" d="clear/exit" /><C t="muted"> · </C>
    <KeyHint k="/" d="commands" /><C t="muted"> · </C><KeyHint k="!" d="bash" /><C t="muted"> · </C><KeyHint k="ctrl+o" d="more" />
  </>
);

/**
 * The startup header: the logo with the version.
 *
 * @param props - Whether to show the full key-hint list.
 * @returns The header.
 */
export function Header({ expanded }: { expanded?: boolean }) {
  return (
    <>
      <Line><PiLogoRow row={0} /> <C t="dim">v0.87.1</C></Line>
      <Line><PiLogoRow row={1} />{expanded ? null : <> {COMPACT_HINTS}</>}</Line>
      {expanded && [["escape", "to interrupt"], ["ctrl+c", "to clear"], ["ctrl+c twice", "to exit"], ["ctrl+d", "to exit (empty)"], ["shift+tab", "to cycle thinking level"], ["ctrl+l", "to select model"], ["ctrl+o", "to expand tools"], ["/", "for commands"], ["!", "to run bash"]].map(([k, d]) => (
        <Line key={k}><KeyHint k={k} d={d} /></Line>
      ))}
      <Line><C t="dim">Press ctrl+o to show full startup help and loaded resources.</C></Line>
      <Line />
      <Line><C t="dim">Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.</C></Line>
    </>
  );
}

/**
 * The startup list of loaded context files and skills.
 *
 * @returns The list.
 */
export function LoadedResources() {
  return (
    <>
      <Line><C t="mdHeading">[Context]</C></Line>
      <Line><C t="dim">  AGENTS.md, ~/.pi/agent/AGENTS.md</C></Line>
      <Line><C t="mdHeading">[Skills]</C></Line>
      <Line><C t="dim">  design-tokens, figma-plugin, html-prototypes</C></Line>
    </>
  );
}

/**
 * A dim status message.
 *
 * @param props - The message.
 * @returns The line.
 */
export const StatusLine = ({ text }: { text: string }) => <Line indent={1}><C t="dim">{text}</C></Line>;

/**
 * A warning message.
 *
 * @param props - The message.
 * @returns The line.
 */
export const WarningLine = ({ text }: { text: string }) => <Line indent={1}><C t="warning">Warning: {text}</C></Line>;

/**
 * An error message.
 *
 * @param props - The message.
 * @returns The line.
 */
export const ErrorLine = ({ text }: { text: string }) => <Line indent={1}><C t="error">Error: {text}</C></Line>;

/**
 * The spinner shown while the agent works.
 *
 * @param props - The spinner frame and message.
 * @returns The line.
 */
export function WorkingIndicator({ frame = "⠋", text = "Working..." }: { frame?: string; text?: string }) {
  return <Line indent={1}><C t="accent">{frame}</C> <C t="muted">{text} (escape to interrupt)</C></Line>;
}

// ---------------------------------------------------------------- messages

/**
 * A user message on its panel.
 *
 * @param props - The message.
 * @returns The panel.
 */
export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <Panel bg="userMessageBg">
      <C t="userMessageText">{children}</C>
    </Panel>
  );
}

/**
 * Assistant text: Markdown on the canvas.
 *
 * @param props - The content.
 * @returns The text.
 */
export function AssistantText({ children }: { children: ReactNode }) {
  return <div className="assistant"><C t="text">{children}</C></div>;
}

/**
 * An assistant thinking block.
 *
 * @param props - Whether it is collapsed to "Thinking...".
 * @returns The block.
 */
export function ThinkingBlock({ collapsed }: { collapsed?: boolean }) {
  return collapsed ? (
    <div className="assistant"><C t="thinkingText" italic>Thinking...</C></div>
  ) : (
    <div className="assistant">
      <C t="thinkingText" italic>The user wants the theme loader. I should read theme.ts first, then check how fallbacks resolve, and keep the answer short.</C>
    </div>
  );
}

/**
 * An extension message on its panel.
 *
 * @param props - The label and message.
 * @returns The panel.
 */
export function CustomMessage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Panel bg="customMessageBg">
      <Line><C t="customMessageLabel" bold>[{label}]</C></Line>
      <C t="customMessageText">{children}</C>
    </Panel>
  );
}

/**
 * A compaction summary on the custom-message panel.
 *
 * @param props - Whether the summary is expanded.
 * @returns The panel.
 */
export function CompactionMessage({ expanded }: { expanded?: boolean }) {
  return (
    <Panel bg="customMessageBg">
      <Line><C t="customMessageLabel" bold>[compaction]</C></Line>
      {expanded ? (
        <C t="customMessageText">The session covered theme token proposals, contrast requirements, and hue families.</C>
      ) : (
        <Line><C t="customMessageText">Compacted from 184,210 tokens (</C><C t="dim">ctrl+o</C><C t="customMessageText"> to expand)</C></Line>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- markdown

/**
 * Markdown sample: heading, emphasis, links, lists, quote, rule, and code.
 *
 * @returns The sample.
 */
export function Md() {
  return (
    <AssistantText>
      <Line><C t="mdHeading" bold underline>Theme loading</C></Line>
      <Line />
      <Line><C t="mdHeading" bold>## Resolution order</C></Line>
      <Line />
      <Line>Pi reads a theme with <C t="mdCode">loadTheme()</C>, see the <C t="mdLink" underline>theme docs</C> <C t="mdLinkUrl">(docs/themes.md)</C>. Some text is <C t="text" bold>bold</C>, <C t="text" italic>italic</C>, or <C t="text" strike>struck</C>.</Line>
      <Line />
      <Line><C t="mdListBullet">- </C>Built-in themes load first</Line>
      <Line><C t="mdListBullet">- </C>Custom themes can override them</Line>
      <Line>  <C t="mdListBullet">1. </C>Project themes need trust</Line>
      <Line />
      <Line><C t="mdQuoteBorder">│ </C><C t="mdQuote" italic>Invalid themes fall back to dark.</C></Line>
      <Line />
      <CodeBlock />
      <Line />
      <MdTable />
      <Line />
      <Line><C t="mdHr">{"─".repeat(60)}</C></Line>
    </AssistantText>
  );
}

/**
 * A fenced code block.
 *
 * @returns The block.
 */
export function CodeBlock() {
  return (
    <>
      <Line><C t="mdCodeBlockBorder">```typescript</C></Line>
      <Code />
      <Line><C t="mdCodeBlockBorder">```</C></Line>
      <Line><C t="mdCodeBlockBorder">```</C></Line>
      <Line indent={2}><C t="mdCodeBlock">plain code block without a language</C></Line>
      <Line><C t="mdCodeBlockBorder">```</C></Line>
    </>
  );
}

/**
 * Syntax-highlighted code, as cli-highlight maps it (theme.ts buildCliHighlightTheme).
 *
 * @param props - Indentation in cells.
 * @returns The code.
 */
export function Code({ indent = 2 }: { indent?: number }) {
  return (
    <>
      <Line indent={indent}><C t="syntaxComment">/** Resolve a theme by name. */</C></Line>
      <Line indent={indent}><C t="syntaxKeyword">export function</C> <C t="syntaxFunction">loadTheme</C><C t="syntaxPunctuation">(</C><C t="syntaxVariable">name</C><C t="syntaxPunctuation">: </C><C t="syntaxType">string</C><C t="syntaxPunctuation">): </C><C t="syntaxType">Theme</C><C t="syntaxPunctuation"> {"{"}</C></Line>
      <Line indent={indent + 2}><C t="syntaxKeyword">const</C> <C t="syntaxVariable">retries</C> <C t="syntaxOperator">=</C> <C t="syntaxNumber">3</C><C t="syntaxPunctuation">;</C> <C t="syntaxComment">// fall back after three tries</C></Line>
      <Line indent={indent + 2}><C t="syntaxKeyword">if</C> <C t="syntaxPunctuation">(</C><C t="syntaxVariable">name</C> <C t="syntaxOperator">===</C> <C t="syntaxNumber">null</C><C t="syntaxPunctuation">)</C> <C t="syntaxKeyword">return</C> <C t="syntaxFunction">read</C><C t="syntaxPunctuation">(</C><C t="syntaxString">"themes/dark.json"</C><C t="syntaxPunctuation">);</C></Line>
      <Line indent={indent}><C t="syntaxPunctuation">{"}"}</C></Line>
    </>
  );
}

/**
 * A Markdown table.
 *
 * @returns The table.
 */
export function MdTable() {
  const b = (s: string) => <C t="mdTableBorder">{s}</C>;
  return (
    <>
      <Line>{b("┌────────────┬────────┐")}</Line>
      <Line>{b("│ ")}<C t="text" bold>Token     </C>{b(" │ ")}<C t="text" bold>Ratio </C>{b(" │")}</Line>
      <Line>{b("├────────────┼────────┤")}</Line>
      <Line>{b("│ ")}text      {b(" │ ")}9.1   {b(" │")}</Line>
      <Line>{b("├────────────┼────────┤")}</Line>
      <Line>{b("│ ")}muted     {b(" │ ")}6.8   {b(" │")}</Line>
      <Line>{b("└────────────┴────────┘")}</Line>
    </>
  );
}

/**
 * A rendered Mermaid diagram.
 *
 * @returns The diagram.
 */
export function Mermaid() {
  return (
    <AssistantText>
      <Line><C t="accent" bold>Theme loading</C></Line>
      <Line><C t="borderMuted">┌──────────┐</C>    <C t="borderMuted">┌──────────┐</C></Line>
      <Line><C t="borderMuted">│</C> <C t="text">settings</C> <C t="borderMuted">├</C><C t="accent">───▶</C><C t="borderMuted">│</C> <C t="text">theme.ts</C> <C t="borderMuted">│</C></Line>
      <Line><C t="borderMuted">└──────────┘</C> <C t="muted">load</C> <C t="borderMuted">└──────────┘</C></Line>
    </AssistantText>
  );
}

// ---------------------------------------------------------------- tools

/** A tool call's state, which picks its panel background. */
export type ToolState = "pending" | "success" | "error";

/**
 * Pick a tool panel's background token.
 *
 * @param state - The tool state.
 * @returns The token.
 */
const toolBg = (state: ToolState) => (state === "pending" ? "toolPendingBg" : state === "success" ? "toolSuccessBg" : "toolErrorBg");

/**
 * The read tool.
 *
 * @param props - The tool state, and whether the file content is expanded.
 * @returns The panel.
 */
export function ReadTool({ state = "success", expanded }: { state?: ToolState; expanded?: boolean }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>read</C> <C t="toolArgument" underline>src/theme/theme.ts</C><C t="warning">:1-40</C></Line>
      {expanded && (<><Line /><Code indent={0} /></>)}
      {!expanded && state === "error" && (<><Line /><Line><C t="error">ENOENT: no such file or directory</C></Line></>)}
    </Panel>
  );
}

/**
 * A read tool collapsed to one line.
 *
 * @returns The panel.
 */
export function CompactReadTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>read docs</C> <C t="toolArgument">docs/themes.md</C><C t="muted"> (ctrl+o to expand)</C></Line>
    </Panel>
  );
}

/**
 * A skill read, shown as a labeled line.
 *
 * @returns The panel.
 */
export function SkillReadTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="customMessageLabel" bold>[skill] </C><C t="customMessageText">figma-plugin</C><C t="muted"> (ctrl+o to expand)</C></Line>
    </Panel>
  );
}

/**
 * The bash tool.
 *
 * @param props - The tool state, and whether all output is shown.
 * @returns The panel.
 */
export function BashTool({ state = "success", expanded }: { state?: ToolState; expanded?: boolean }) {
  const lines = ["Checked 1458 files in 6s. No fixes applied.", "packages/coding-agent/install-lock is up to date.", "packages/tui: 82 tests passed", "packages/ai: model catalog hydrated", "done"];
  const shown = expanded ? lines : lines.slice(-3);
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>$ npm run check</C><C t="muted"> (timeout 600s)</C></Line>
      <Line />
      {!expanded && <Line><C t="muted">... (2 earlier lines,</C> <KeyHint k="ctrl+o" d="to expand" /><C t="muted">)</C></Line>}
      {shown.map((line) => <Line key={line}><C t="toolOutput">{line}</C></Line>)}
      {state === "error" && <Line><C t="toolOutput">npm error Lifecycle script `check` failed with error: code 2</C></Line>}
      <Line />
      <Line><C t="muted">{state === "pending" ? "Elapsed 3.1s" : "Took 6.2s"}</C></Line>
    </Panel>
  );
}

/**
 * The grep tool.
 *
 * @param props - The tool state.
 * @returns The panel.
 */
export function GrepTool({ state = "success" }: { state?: ToolState }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>grep</C> <C t="toolArgument">/loadTheme/</C><C t="toolOutput"> in src (*.ts)</C></Line>
      <Line />
      {state === "error" ? (
        <Line><C t="error">Error: path not found: src</C></Line>
      ) : (
        <>
          <Line><C t="toolOutput">src/theme/theme.ts:612: export function loadTheme(name: string)</C></Line>
          <Line><C t="toolOutput">src/theme/theme.ts:640:   return loadTheme(fallback)</C></Line>
          <Line><C t="muted">... (4 more lines,</C> <KeyHint k="ctrl+o" d="to expand" /><C t="muted">)</C></Line>
        </>
      )}
    </Panel>
  );
}

/**
 * The find tool.
 *
 * @returns The panel.
 */
export function FindTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>find</C> <C t="toolArgument">*.json</C><C t="toolOutput"> in themes (limit 20)</C></Line>
      <Line />
      <Line><C t="toolOutput">themes/dark.json</C></Line>
      <Line><C t="toolOutput">themes/light.json</C></Line>
    </Panel>
  );
}

/**
 * The write tool.
 *
 * @returns The panel.
 */
export function WriteTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>write</C> <C t="toolArgument" underline>docs/theme-tokens.md</C></Line>
      <Line />
      <Line><C t="toolOutput"># Theme tokens</C></Line>
      <Line><C t="toolOutput">Proposed optional tokens and their fallbacks.</C></Line>
      <Line><C t="muted">... (12 more lines, 14 total,</C> <KeyHint k="ctrl+o" d="to expand" /><C t="muted">)</C></Line>
    </Panel>
  );
}

/**
 * The edit tool, with a diff.
 *
 * @param props - The tool state.
 * @returns The panel.
 */
export function EditTool({ state = "success" }: { state?: ToolState }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>edit</C> <C t="toolArgument" underline>src/theme/theme.ts</C></Line>
      <Line />
      {state === "error" ? (
        <Line><C t="error">Could not find the exact text to replace in src/theme/theme.ts</C></Line>
      ) : (
        <>
          <Line><C t="toolDiffContext"> 610 // Resolve fallbacks before loading</C></Line>
          <Line><C t="toolDiffRemoved">-611   return colors.<C t="toolDiffRemoved" inverse>dim</C>;</C></Line>
          <Line><C t="toolDiffAdded">+611   return colors.<C t="toolDiffAdded" inverse>toolArgument ?? colors.accent</C>;</C></Line>
          <Line><C t="toolDiffAdded">+612   // new optional token</C></Line>
          <Line><C t="toolDiffContext"> 613 {"}"}</C></Line>
        </>
      )}
    </Panel>
  );
}

/**
 * The ls tool.
 *
 * @returns The panel.
 */
export function LsTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>ls</C> <C t="toolArgument" underline>src/theme</C></Line>
      <Line />
      <Line><C t="toolOutput">dark.json  light.json  theme.ts  theme-json.ts  theme-schema.json</C></Line>
    </Panel>
  );
}

/**
 * An extension tool with the default renderer.
 *
 * @returns The panel.
 */
export function GenericTool() {
  return (
    <Panel bg="toolPendingBg">
      <Line><C t="toolTitle" bold>figma_run</C></Line>
      <Line />
      <Line><C t="toolOutput">{`{ "selection": 2, "nodes": ["12:4", "12:9"] }`}</C></Line>
    </Panel>
  );
}

/**
 * A direct `!` command (BashExecutionComponent): on the canvas, framed by bashMode borders.
 *
 * @param props - Whether the command is excluded from context (`!!`), and whether it failed.
 * @returns The command and output.
 */
export function DirectBash({ excluded, error }: { excluded?: boolean; error?: boolean }) {
  const color = excluded ? "dim" : "bashMode";
  return (
    <>
      <Gap />
      <Rule t={color} />
      <Line indent={1}><C t={color} bold>$ {excluded ? "git status" : "ls themes"}</C></Line>
      <Line />
      <Line indent={1}><C t="toolOutput">dark.json</C></Line>
      <Line indent={1}><C t="toolOutput">light.json</C></Line>
      {error && (<><Line /><Line indent={1}><C t="error">(exit 1)</C></Line></>)}
      <Rule t={color} />
    </>
  );
}

// ---------------------------------------------------------------- editor, footer

/**
 * The input editor.
 *
 * @param props - The text, the border token, whether the text is a placeholder, whether to show the cursor, and bash mode.
 * @returns The editor.
 */
export function Editor({ text, border, placeholder, cursor = true, bashMode }: { text: string; border: string; placeholder?: boolean; cursor?: boolean; bashMode?: boolean }) {
  const t = bashMode ? "bashMode" : border;
  return (
    <div className="editor">
      <Rule t={t} />
      <Line>
        {text ? <C t="text">{text}</C> : null}
        {cursor && <C t="text" inverse>{placeholder ? " " : " "}</C>}
      </Line>
      <Rule t={t} />
    </div>
  );
}

/**
 * The footer: working directory, usage, context, and model.
 *
 * @param props - Context use in percent (colored above 70 and 90), the model, and the thinking level.
 * @returns The footer.
 */
export function Footer({ context = 18.4, model = "claude-opus-4-8", thinking = "high" }: { context?: number; model?: string; thinking?: string }) {
  const contextColor = context > 90 ? "error" : context > 70 ? "warning" : undefined;
  const contextText = `${context.toFixed(1)}%/272k (auto)`;
  return (
    <div className="footer">
      <Line><C t="dim">~/Documents/GitHub/pi-theme (main)</C></Line>
      <div className="line footer-stats">
        <span>
          <C t="dim">↑636k ↓100k R27M CH99.4% $7.690 (sub) </C>
          {contextColor ? <C t={contextColor}>{contextText}</C> : <C t="dim">{contextText}</C>}
        </span>
        <C t="dim">{`${model} • ${thinking}`}</C>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- selectors, dialogs

/** A select list row. */
export interface SelectItem {
  /** Row text. */
  label: string;
  /** Muted text after the label. */
  description?: string;
}

/**
 * A select list (autocomplete, extension select): the selected row in accent with a → prefix.
 *
 * @param props - The rows, the selected index, and the visible row count.
 * @returns The list.
 */
export function SelectList({ items, selected, max = 8 }: { items: SelectItem[]; selected: number; max?: number }) {
  const start = Math.max(0, Math.min(selected - Math.floor(max / 2), items.length - max));
  const visible = items.slice(start, start + max);
  const width = Math.max(...items.map((item) => item.label.length)) + 2;
  return (
    <>
      {visible.map((item, i) => {
        const isSelected = start + i === selected;
        return (
          <Line key={item.label}>
            {isSelected ? <C t="accent">→ </C> : "  "}
            {isSelected ? <C t="accent">{item.label.padEnd(width)}</C> : <C t="text">{item.label.padEnd(width)}</C>}
            {item.description && <C t="muted">{item.description}</C>}
          </Line>
        );
      })}
      {items.length > max && <Line><C t="muted">  ({selected + 1}/{items.length})</C></Line>}
    </>
  );
}

/** A settings row. */
export interface SettingItem {
  /** Setting name. */
  label: string;
  /** Current value. */
  value: string;
  /** Shown below the list while the row is selected. */
  description?: string;
}

/**
 * The settings list: the selected label and value in accent, description and hint dim.
 *
 * @param props - The rows and the selected index.
 * @returns The list.
 */
export function SettingsList({ items, selected }: { items: SettingItem[]; selected: number }) {
  const width = Math.max(...items.map((item) => item.label.length));
  const current = items[selected];
  return (
    <>
      {items.map((item, i) => {
        const isSelected = i === selected;
        return (
          <Line key={item.label}>
            {isSelected ? <C t="accent">→ </C> : "  "}
            {isSelected ? <C t="accent">{item.label.padEnd(width)}</C> : <C t="text">{item.label.padEnd(width)}</C>}
            {"  "}
            <C t={isSelected ? "accent" : "muted"}>{item.value}</C>
          </Line>
        );
      })}
      {current?.description && (<><Line /><Line><C t="dim">  {current.description}</C></Line></>)}
      <Line><C t="dim">  Type to search · Enter/Space to change · Esc to cancel</C></Line>
    </>
  );
}

/**
 * A dialog framed by borders.
 *
 * @param props - The title and content.
 * @returns The dialog.
 */
export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Rule />
      <Line indent={1}><C t="accent" bold>{title}</C></Line>
      <Line />
      {children}
      <Rule />
    </>
  );
}

// ---------------------------------------------------------------- session tree

/** A session tree row. */
export interface TreeRow {
  /** Tree-drawing prefix, like `├─ `. */
  prefix: string;
  /** Entry type, which picks its label and colors. */
  kind: "user" | "assistant" | "tool" | "bash" | "compaction" | "custom" | "model" | "thinking" | "label" | "title";
  /** Entry text. */
  text: string;
  /** Whether the entry is on the active branch. */
  active?: boolean;
  /** A user-assigned label. */
  label?: string;
}

/** Example session tree rows. */
export const TREE_ROWS: TreeRow[] = [
  { prefix: "", kind: "user", text: "Can you explain how theme loading works?", active: true },
  { prefix: "", kind: "assistant", text: "Pi reads the theme with loadTheme()...", active: true },
  { prefix: "├─ ", kind: "tool", text: "read src/theme/theme.ts:1-40", active: true },
  { prefix: "│  ", kind: "model", text: "claude-opus-4-8", active: true },
  { prefix: "│  ", kind: "thinking", text: "high", active: true },
  { prefix: "│  ", kind: "compaction", text: "184", active: true },
  { prefix: "│  ", kind: "user", text: "Add optional toolArgument token", active: true, label: "proposal" },
  { prefix: "│  ", kind: "bash", text: "npm run check", active: true },
  { prefix: "│  ", kind: "assistant", text: "Done. npm run check passes.", active: true },
  { prefix: "└⊟ ", kind: "user", text: "What about perceptual contrast instead?" },
  { prefix: "   ", kind: "custom", text: "Branch summary: explored perceptual targets" },
  { prefix: "   ", kind: "title", text: "theme review" },
];

/**
 * One session tree row (tree-selector.ts).
 *
 * @param props - The row, and whether it is selected.
 * @returns The row.
 */
export function TreeRowView({ row, selected }: { row: TreeRow; selected: boolean }) {
  const content = (() => {
    switch (row.kind) {
      case "user": return <><C t="accent">user: </C><C t="text">{row.text}</C></>;
      case "assistant": return <><C t="success">assistant: </C><C t="text">{row.text}</C></>;
      case "tool": return <C t="muted">[{row.text}]</C>;
      case "bash": return <C t="dim">[bash]: {row.text}</C>;
      case "compaction": return <C t="customMessageLabel">[compaction: {row.text}k tokens]</C>;
      case "custom": return <><C t="customMessageLabel">[branch]: </C><C t="text">{row.text}</C></>;
      case "model": return <C t="dim">[model: {row.text}]</C>;
      case "thinking": return <C t="dim">[thinking: {row.text}]</C>;
      case "label": return <C t="dim">[label: {row.text}]</C>;
      case "title": return <C t="dim">[title: {row.text}]</C>;
    }
  })();
  const body = (
    <>
      {selected ? <C t="accent">› </C> : "  "}
      <C t="dim">{row.prefix}</C>
      {row.active && <C t="accent">• </C>}
      {row.label && <C t="warning">[{row.label}] </C>}
      {content}
    </>
  );
  return selected ? <Line><C t="terminalForeground" bg="selectedBg">{body}</C></Line> : <Line>{body}</Line>;
}

/**
 * The session tree selector.
 *
 * @param props - The selected row.
 * @returns The selector.
 */
export function SessionTree({ selected }: { selected: number }) {
  return (
    <>
      <Rule />
      <Line indent={1}><C t="accent" bold>Session tree</C></Line>
      <Line><C t="muted">  Type to search:</C></Line>
      <Line />
      {TREE_ROWS.map((row, i) => <TreeRowView key={i} row={row} selected={i === selected} />)}
      <Line><C t="muted">  ({selected + 1}/{TREE_ROWS.length})</C></Line>
      <Line><KeyHint k="  enter" d="navigate" /><C t="muted"> · </C><KeyHint k="escape" d="close" /></Line>
      <Rule />
    </>
  );
}

// ---------------------------------------------------------------- sessions, models

/** Example sessions for the session selector. */
export const SESSIONS = [
  { name: "theme review", age: "2m", count: 142, current: true },
  { name: "Add toolArgument token", age: "1h", count: 58, named: true },
  { name: "Perceptual contrast minimums", age: "3h", count: 33 },
  { name: "Fix table borders", age: "1d", count: 12 },
  { name: "Ghostty background detection", age: "2d", count: 7 },
];

/**
 * The session selector (`/resume`).
 *
 * @param props - The selected row.
 * @returns The selector.
 */
export function SessionSelector({ selected }: { selected: number }) {
  return (
    <>
      <Rule t="accent" />
      <Line indent={1}><C t="accent" bold>Resume session</C></Line>
      <Line indent={1}><C t="muted">Sort: </C><C t="accent">recent</C><C t="muted">  Name: </C><C t="accent">all</C><C t="muted">  </C><C t="accent">◉ Current Folder</C><C t="muted"> | ○ All</C></Line>
      <Line />
      {SESSIONS.map((session, i) => {
        const isSelected = i === selected;
        const color: string = session.current ? "accent" : session.named ? "warning" : "text";
        const row = (
          <div className="line footer-stats">
            <span>{isSelected ? <C t="accent">› </C> : "  "}<C t={color} bold={isSelected}>{session.name}</C></span>
            <C t="dim">{session.count} {session.age}</C>
          </div>
        );
        return isSelected ? <C key={session.name} t="terminalForeground" bg="selectedBg">{row}</C> : <div key={session.name}>{row}</div>;
      })}
      <Line />
      <Line><KeyHint k="  tab" d="scope" /><C t="muted"> · </C><C t="muted">re:&lt;pattern&gt; regex · "phrase" exact</C></Line>
      <Rule t="accent" />
    </>
  );
}

/** Example models for the model selector. */
export const MODELS = [
  { id: "claude-opus-4-8", provider: "anthropic", current: true },
  { id: "claude-sonnet-4-5", provider: "anthropic" },
  { id: "gpt-5.5", provider: "openai", isDefault: true },
  { id: "gemini-3-pro", provider: "google" },
];

/**
 * The model selector.
 *
 * @param props - The selected row.
 * @returns The selector.
 */
export function ModelSelector({ selected }: { selected: number }) {
  return (
    <>
      <Rule />
      <Line indent={1}><C t="muted">Scope: </C><C t="accent">all</C><C t="muted"> | </C><C t="muted">scoped</C></Line>
      <Line />
      {MODELS.map((model, i) => {
        const isSelected = i === selected;
        return (
          <Line key={model.id}>
            {isSelected ? <C t="accent">→ </C> : "  "}
            {model.current ? <C t="accent">✓ </C> : "  "}
            {isSelected ? <C t="accent">{model.id}</C> : <C t="text">{model.id}</C>}
            {" "}<C t="muted">[{model.provider}]</C>
            {model.isDefault && <C t="muted"> · default</C>}
          </Line>
        );
      })}
      <Line />
      <Line><C t="muted">  Model Name: {MODELS[selected].id}</C></Line>
      <Line><KeyHint k="  tab" d="scope" /><C t="muted"> (all/scoped)</C></Line>
      <Rule />
    </>
  );
}

// ---------------------------------------------------------------- fullscreen chrome

/**
 * The fullscreen transcript search box (alt-screen-search.ts).
 *
 * @param props - The query, the current match index, and the match count.
 * @returns The search box.
 */
export function SearchBox({ query, index, count }: { query: string; index: number; count: number }) {
  const result = !query ? "" : count === 0 ? "No matches" : `${index + 1}/${count}`;
  return (
    <div className="search">
      <Line>┌{"─".repeat(46)}┐</Line>
      <div className="line footer-stats">
        <span>│ {query ? <C t="terminalForeground">{query}</C> : <C t="muted">Find in transcript</C>}</span>
        <span>{result && <C t="muted"> {result} </C>}│</span>
      </div>
      <Line>└{"─".repeat(22)} ↑ Shift+Enter · ↓ Enter ─┘</Line>
    </div>
  );
}

/**
 * A search match in the transcript.
 *
 * @param props - The matched text, and whether it is the current match (shown inverse).
 * @returns The match.
 */
export function SearchMatch({ children, current }: { children: ReactNode; current?: boolean }) {
  return current
    ? <C t="searchMatchText" bg="searchMatchBg" inverse bold>{children}</C>
    : <C t="searchMatchText" bg="searchMatchBg" underline>{children}</C>;
}

/**
 * The "jump to latest" bar shown when scrolled up.
 *
 * @returns The bar.
 */
export function JumpToLatest() {
  return <Line><C t="text" bg="selectedBg"> ↓ Jump to latest message · End </C></Line>;
}
