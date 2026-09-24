// Pi TUI elements, mirroring ../pi components and their token usage.
import type { ReactNode } from "react";
import { C, Gap, KeyHint, Line, Panel, Rule, type TokenRef, useTarget } from "./term.tsx";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export const thinkingToken = (level: ThinkingLevel) => `thinking${level[0].toUpperCase()}${level.slice(1)}`;

/** Proposed-token spots: extended uses the new token, current uses today's fallback. */
const FOOTER: TokenRef = { current: "dim", extended: "footerText" };
const TOOL_ARG: TokenRef = { current: "accent", extended: "toolArgument" };
const ASSISTANT: TokenRef = { current: "terminalForeground", extended: "text" };
const TABLE_BORDER: TokenRef = { current: "terminalForeground", extended: "mdTableBorder" };
/** List and row text: unstyled (terminal default) in current Pi, `text` in the proposal. */
const LIST_TEXT: TokenRef = { current: "terminalForeground", extended: "text" };

// ---------------------------------------------------------------- header, status

/**
 * The Pi logo: a 4x4 pixel grid in fixed brand colors (not theme tokens).
 * Pi draws it with half blocks in a 4x2 cell area (components/pi-logo.ts); here each
 * pixel is a 1ch x half-row box, which renders the same without glyph seams.
 */
const LOGO_COLORS = { R: "#f09082", B: "#4d9abf", Y: "#f1be58" } as const;
const LOGO_GRID = ["RRR.", "B.R.", "BB.Y", "B..Y"];

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

const COMPACT_HINTS = (
  <>
    <KeyHint k="escape" d="interrupt" /><C t="muted"> · </C><KeyHint k="ctrl+c/ctrl+d" d="clear/exit" /><C t="muted"> · </C>
    <KeyHint k="/" d="commands" /><C t="muted"> · </C><KeyHint k="!" d="bash" /><C t="muted"> · </C><KeyHint k="ctrl+o" d="more" />
  </>
);

/** Startup header. Current Pi: "pi" in accent; the proposal: logo with the version. */
export function Header({ expanded }: { expanded?: boolean }) {
  const proposal = useTarget() === "extended";
  const version = proposal
    ? <C t="dim">v0.87.1</C>
    : <><C t="accent" bold>pi</C><C t="dim"> v0.87.1</C></>;
  return (
    <>
      {proposal ? (
        <>
          <Line><PiLogoRow row={0} /> {version}</Line>
          <Line><PiLogoRow row={1} />{expanded ? null : <> {COMPACT_HINTS}</>}</Line>
        </>
      ) : (
        <>
          <Line>{version}</Line>
          {/* The logo takes a second row; pad here so later content lines up in the wiper. */}
          {expanded && <Line />}
        </>
      )}
      {expanded ? (
        <>
          {[["escape", "to interrupt"], ["ctrl+c", "to clear"], ["ctrl+c twice", "to exit"], ["ctrl+d", "to exit (empty)"], ["shift+tab", "to cycle thinking level"], ["ctrl+l", "to select model"], ["ctrl+o", "to expand tools"], ["/", "for commands"], ["!", "to run bash"]].map(([k, d]) => (
            <Line key={k}><KeyHint k={k} d={d} /></Line>
          ))}
        </>
      ) : proposal ? null : (
        <Line>{COMPACT_HINTS}</Line>
      )}
      <Line><C t="dim">Press ctrl+o to show full startup help and loaded resources.</C></Line>
      <Line />
      <Line><C t="dim">Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.</C></Line>
    </>
  );
}

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

export const StatusLine = ({ text }: { text: string }) => <Line indent={1}><C t="dim">{text}</C></Line>;
export const WarningLine = ({ text }: { text: string }) => <Line indent={1}><C t="warning">Warning: {text}</C></Line>;
export const ErrorLine = ({ text }: { text: string }) => <Line indent={1}><C t="error">Error: {text}</C></Line>;

export function WorkingIndicator({ frame = "⠋", text = "Working..." }: { frame?: string; text?: string }) {
  return <Line indent={1}><C t="accent">{frame}</C> <C t="muted">{text} (escape to interrupt)</C></Line>;
}

// ---------------------------------------------------------------- messages

export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <Panel bg="userMessageBg">
      <C t="userMessageText">{children}</C>
    </Panel>
  );
}

/** Assistant text: Markdown on the canvas. Extended colors default text with `text`. */
export function AssistantText({ children }: { children: ReactNode }) {
  return <div className="assistant"><C t={ASSISTANT}>{children}</C></div>;
}

export function ThinkingBlock({ collapsed }: { collapsed?: boolean }) {
  return collapsed ? (
    <div className="assistant"><C t="thinkingText" italic>Thinking...</C></div>
  ) : (
    <div className="assistant">
      <C t="thinkingText" italic>The user wants the theme loader. I should read theme.ts first, then check how fallbacks resolve, and keep the answer short.</C>
    </div>
  );
}

export function CustomMessage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Panel bg="customMessageBg">
      <Line><C t="customMessageLabel" bold>[{label}]</C></Line>
      <C t="customMessageText">{children}</C>
    </Panel>
  );
}

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

export function Md() {
  return (
    <AssistantText>
      <Line><C t="mdHeading" bold underline>Theme loading</C></Line>
      <Line />
      <Line><C t="mdHeading" bold>## Resolution order</C></Line>
      <Line />
      <Line>Pi reads a theme with <C t="mdCode">loadTheme()</C>, see the <C t="mdLink" underline>theme docs</C> <C t="mdLinkUrl">(docs/themes.md)</C>. Some text is <C t={ASSISTANT} bold>bold</C>, <C t={ASSISTANT} italic>italic</C>, or <C t={ASSISTANT} strike>struck</C>.</Line>
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

/** Syntax highlighting as cli-highlight maps it (theme.ts buildCliHighlightTheme). */
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

export function MdTable() {
  const b = (s: string) => <C t={TABLE_BORDER}>{s}</C>;
  return (
    <>
      <Line>{b("┌────────────┬────────┐")}</Line>
      <Line>{b("│ ")}<C t={ASSISTANT} bold>Token     </C>{b(" │ ")}<C t={ASSISTANT} bold>Ratio </C>{b(" │")}</Line>
      <Line>{b("├────────────┼────────┤")}</Line>
      <Line>{b("│ ")}text      {b(" │ ")}9.1   {b(" │")}</Line>
      <Line>{b("├────────────┼────────┤")}</Line>
      <Line>{b("│ ")}muted     {b(" │ ")}6.8   {b(" │")}</Line>
      <Line>{b("└────────────┴────────┘")}</Line>
    </>
  );
}

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

export type ToolState = "pending" | "success" | "error";
const toolBg = (state: ToolState) => (state === "pending" ? "toolPendingBg" : state === "success" ? "toolSuccessBg" : "toolErrorBg");

export function ReadTool({ state = "success", expanded }: { state?: ToolState; expanded?: boolean }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>read</C> <C t={TOOL_ARG} underline>src/theme/theme.ts</C><C t="warning">:1-40</C></Line>
      {expanded && (<><Line /><Code indent={0} /></>)}
      {!expanded && state === "error" && (<><Line /><Line><C t="error">ENOENT: no such file or directory</C></Line></>)}
    </Panel>
  );
}

export function CompactReadTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>read docs</C> <C t={TOOL_ARG}>docs/themes.md</C><C t={{ current: "dim", extended: "muted" }}> (ctrl+o to expand)</C></Line>
    </Panel>
  );
}

export function SkillReadTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="customMessageLabel" bold>[skill] </C><C t="customMessageText">figma-plugin</C><C t={{ current: "dim", extended: "muted" }}> (ctrl+o to expand)</C></Line>
    </Panel>
  );
}

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

export function GrepTool({ state = "success" }: { state?: ToolState }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>grep</C> <C t={TOOL_ARG}>/loadTheme/</C><C t="toolOutput"> in src (*.ts)</C></Line>
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

export function FindTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>find</C> <C t={TOOL_ARG}>*.json</C><C t="toolOutput"> in themes (limit 20)</C></Line>
      <Line />
      <Line><C t="toolOutput">themes/dark.json</C></Line>
      <Line><C t="toolOutput">themes/light.json</C></Line>
    </Panel>
  );
}

export function WriteTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>write</C> <C t={TOOL_ARG} underline>docs/theme-tokens.md</C></Line>
      <Line />
      <Line><C t="toolOutput"># Theme tokens</C></Line>
      <Line><C t="toolOutput">Proposed optional tokens and their fallbacks.</C></Line>
      <Line><C t="muted">... (12 more lines, 14 total,</C> <KeyHint k="ctrl+o" d="to expand" /><C t="muted">)</C></Line>
    </Panel>
  );
}

export function EditTool({ state = "success" }: { state?: ToolState }) {
  return (
    <Panel bg={toolBg(state)}>
      <Line><C t="toolTitle" bold>edit</C> <C t={TOOL_ARG} underline>src/theme/theme.ts</C></Line>
      <Line />
      {state === "error" ? (
        <Line><C t="error">Could not find the exact text to replace in src/theme/theme.ts</C></Line>
      ) : (
        <>
          <Line><C t="toolDiffContext"> 610 // Resolve fallbacks before loading</C></Line>
          <Line><C t="toolDiffRemoved">-611   return colors.<C t="toolDiffRemoved" inverse>dim</C>;</C></Line>
          <Line><C t="toolDiffAdded">+611   return colors.<C t="toolDiffAdded" inverse>footerText ?? colors.dim</C>;</C></Line>
          <Line><C t="toolDiffAdded">+612   // new optional token</C></Line>
          <Line><C t="toolDiffContext"> 613 {"}"}</C></Line>
        </>
      )}
    </Panel>
  );
}

export function LsTool() {
  return (
    <Panel bg="toolSuccessBg">
      <Line><C t="toolTitle" bold>ls</C> <C t={TOOL_ARG} underline>src/theme</C></Line>
      <Line />
      <Line><C t="toolOutput">dark.json  light.json  theme.ts  theme-json.ts  theme-schema.json</C></Line>
    </Panel>
  );
}

export function GenericTool() {
  return (
    <Panel bg="toolPendingBg">
      <Line><C t="toolTitle" bold>figma_run</C></Line>
      <Line />
      <Line><C t="toolOutput">{`{ "selection": 2, "nodes": ["12:4", "12:9"] }`}</C></Line>
    </Panel>
  );
}

/** Direct `!` command (BashExecutionComponent): on the canvas, framed by bashMode borders. */
export function DirectBash({ excluded, error }: { excluded?: boolean; error?: boolean }) {
  const color = excluded ? "dim" : "bashMode";
  return (
    <>
      <Gap />
      <Rule t={color} />
      <Line indent={1}><C t={color} bold>$ {excluded ? "git status" : "ls themes"}</C></Line>
      <Line />
      <Line indent={1}><C t={{ current: "muted", extended: "toolOutput" }}>dark.json</C></Line>
      <Line indent={1}><C t={{ current: "muted", extended: "toolOutput" }}>light.json</C></Line>
      {error && (<><Line /><Line indent={1}><C t="error">(exit 1)</C></Line></>)}
      <Rule t={color} />
    </>
  );
}

// ---------------------------------------------------------------- editor, footer

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

export function Footer({ context = 18.4, model = "claude-opus-4-8", thinking = "high" }: { context?: number; model?: string; thinking?: string }) {
  const contextColor = context > 90 ? "error" : context > 70 ? "warning" : undefined;
  const contextText = `${context.toFixed(1)}%/272k (auto)`;
  return (
    <div className="footer">
      <Line><C t={FOOTER}>~/Documents/GitHub/pi-theme (main)</C></Line>
      <div className="line footer-stats">
        <span>
          <C t={FOOTER}>↑636k ↓100k R27M CH99.4% $7.690 (sub) </C>
          {contextColor ? <C t={contextColor}>{contextText}</C> : <C t={FOOTER}>{contextText}</C>}
        </span>
        <C t={FOOTER}>{`${model} • ${thinking}`}</C>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- selectors, dialogs

export interface SelectItem { label: string; description?: string }

/** SelectList (autocomplete, extension select): selected row in accent with → prefix. */
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
            {isSelected ? <C t="accent">{item.label.padEnd(width)}</C> : <C t={LIST_TEXT}>{item.label.padEnd(width)}</C>}
            {item.description && <C t="muted">{item.description}</C>}
          </Line>
        );
      })}
      {items.length > max && <Line><C t="muted">  ({selected + 1}/{items.length})</C></Line>}
    </>
  );
}

export interface SettingItem { label: string; value: string; description?: string }

/** SettingsList: selected label and value in accent, description and hint dim. */
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
            {isSelected ? <C t="accent">{item.label.padEnd(width)}</C> : <C t={LIST_TEXT}>{item.label.padEnd(width)}</C>}
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

export interface TreeRow {
  prefix: string;
  kind: "user" | "assistant" | "tool" | "bash" | "compaction" | "custom" | "model" | "thinking" | "label" | "title";
  text: string;
  active?: boolean;
  label?: string;
}

export const TREE_ROWS: TreeRow[] = [
  { prefix: "", kind: "user", text: "Can you explain how theme loading works?", active: true },
  { prefix: "", kind: "assistant", text: "Pi reads the theme with loadTheme()...", active: true },
  { prefix: "├─ ", kind: "tool", text: "read src/theme/theme.ts:1-40", active: true },
  { prefix: "│  ", kind: "model", text: "claude-opus-4-8", active: true },
  { prefix: "│  ", kind: "thinking", text: "high", active: true },
  { prefix: "│  ", kind: "compaction", text: "184", active: true },
  { prefix: "│  ", kind: "user", text: "Add optional footerText token", active: true, label: "proposal" },
  { prefix: "│  ", kind: "bash", text: "npm run check", active: true },
  { prefix: "│  ", kind: "assistant", text: "Done. npm run check passes.", active: true },
  { prefix: "└⊟ ", kind: "user", text: "What about APCA instead?" },
  { prefix: "   ", kind: "custom", text: "Branch summary: explored APCA targets" },
  { prefix: "   ", kind: "title", text: "theme review" },
];

/** Tree selector rows (tree-selector.ts). Compaction uses customMessageLabel in extended. */
export function TreeRowView({ row, selected }: { row: TreeRow; selected: boolean }) {
  const content = (() => {
    switch (row.kind) {
      case "user": return <><C t="accent">user: </C><C t={LIST_TEXT}>{row.text}</C></>;
      case "assistant": return <><C t="success">assistant: </C><C t={LIST_TEXT}>{row.text}</C></>;
      case "tool": return <C t="muted">[{row.text}]</C>;
      case "bash": return <C t="dim">[bash]: {row.text}</C>;
      case "compaction": return <C t={{ current: "borderAccent", extended: "customMessageLabel" }}>[compaction: {row.text}k tokens]</C>;
      case "custom": return <><C t="customMessageLabel">[branch]: </C><C t={LIST_TEXT}>{row.text}</C></>;
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

export const SESSIONS = [
  { name: "theme review", age: "2m", count: 142, current: true },
  { name: "Add footerText token", age: "1h", count: 58, named: true },
  { name: "APCA derivation", age: "3h", count: 33 },
  { name: "Fix table borders", age: "1d", count: 12 },
  { name: "Ghostty background detection", age: "2d", count: 7 },
];

export function SessionSelector({ selected }: { selected: number }) {
  return (
    <>
      <Rule t="accent" />
      <Line indent={1}><C t="accent" bold>Resume session</C></Line>
      <Line indent={1}><C t="muted">Sort: </C><C t="accent">recent</C><C t="muted">  Name: </C><C t="accent">all</C><C t="muted">  </C><C t="accent">◉ Current Folder</C><C t="muted"> | ○ All</C></Line>
      <Line />
      {SESSIONS.map((session, i) => {
        const isSelected = i === selected;
        const color: TokenRef = session.current ? "accent" : session.named ? "warning" : LIST_TEXT;
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

export const MODELS = [
  { id: "claude-opus-4-8", provider: "anthropic", current: true },
  { id: "claude-sonnet-4-5", provider: "anthropic" },
  { id: "gpt-5.5", provider: "openai", isDefault: true },
  { id: "gemini-3-pro", provider: "google" },
];

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
            {isSelected ? <C t="accent">{model.id}</C> : <C t={LIST_TEXT}>{model.id}</C>}
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

/** Fullscreen transcript search (alt-screen-search.ts). */
export function SearchBox({ query, index, count }: { query: string; index: number; count: number }) {
  const secondary: TokenRef = { current: "terminalForeground", extended: "muted" };
  const result = !query ? "" : count === 0 ? "No matches" : `${index + 1}/${count}`;
  return (
    <div className="search">
      <Line>┌{"─".repeat(46)}┐</Line>
      <div className="line footer-stats">
        <span>│ {query ? <C t="terminalForeground">{query}</C> : <C t={secondary} title="Current Pi: raw faint text; extended: muted"><span className="faint-current">Find in transcript</span></C>}</span>
        <span>{result && <C t={secondary}><span className="faint-current"> {result} </span></C>}│</span>
      </div>
      <Line>└{"─".repeat(22)} ↑ Shift+Enter · ↓ Enter ─┘</Line>
    </div>
  );
}

export function SearchMatch({ children, current }: { children: ReactNode; current?: boolean }) {
  return current
    ? <C t="searchMatchText" bg="searchMatchBg" inverse bold>{children}</C>
    : <C t="searchMatchText" bg="searchMatchBg" underline>{children}</C>;
}

export function JumpToLatest() {
  return <Line><C t="text" bg="selectedBg"> ↓ Jump to latest message · End </C></Line>;
}
