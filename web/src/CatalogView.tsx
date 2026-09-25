/**
 * A scrollable catalog of every reviewable Pi element.
 *
 * @module
 */
import type { ReactNode } from "react";
import {
  AssistantText, BashTool, CompactionMessage, CompactReadTool, CustomMessage, Dialog, DirectBash, EditTool, Editor, ErrorLine,
  FindTool, Footer, GenericTool, GrepTool, Header, JumpToLatest, LoadedResources, LsTool, Md, Mermaid, ModelSelector, ReadTool,
  SearchBox, SearchMatch, SelectList, SessionSelector, SessionTree, SettingsList, SkillReadTool, StatusLine,
  THINKING_LEVELS, ThinkingBlock, UserMessage, WarningLine, WorkingIndicator, WriteTool, thinkingToken,
} from "./pi-elements.tsx";
import { C, Line } from "./term.tsx";
import { ScrollbarCells, TermScroll } from "./term-scroll.tsx";

/**
 * A titled catalog section.
 *
 * @param props - The title, an optional note, and the elements.
 * @returns The section.
 */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="catalog-section">
      <div className="catalog-title"><C t="muted">{`── ${title} `}{"─".repeat(200)}</C></div>
      {note && <div className="catalog-note"><C t="dim">{note}</C></div>}
      {children}
    </section>
  );
}

/** Example rows for the settings list. */
const SETTINGS = [
  { label: "Auto-compact", value: "true", description: "Automatically compact context when it gets too large" },
  { label: "Steering mode", value: "one-at-a-time" },
  { label: "Transport", value: "auto" },
  { label: "Theme", value: "generated-pi-dark" },
  { label: "Hide thinking", value: "false" },
];

/**
 * The catalog.
 *
 * @returns The catalog, in a terminal viewport.
 */
export function CatalogView() {
  return (
    <TermScroll>
    <div className="catalog">
      <Section title="Startup header and loaded resources" note="The proposal shows the logo with the version.">
        <Header />
        <Line />
        <Header expanded />
        <Line />
        <LoadedResources />
      </Section>

      <Section title="Messages">
        <UserMessage>Can you explain how theme loading works? Please keep it short.</UserMessage>
        <ThinkingBlock />
        <ThinkingBlock collapsed />
        <AssistantText><Line>Pi reads the theme once at startup and again when the theme file changes.</Line></AssistantText>
        <CustomMessage label="figma-plugin">Custom message from an extension, with its type label.</CustomMessage>
        <CompactionMessage />
        <CompactionMessage expanded />
        <CustomMessage label="branch">Branch summary (<C t="dim">ctrl+o</C> to expand)</CustomMessage>
      </Section>

      <Section title="Markdown and syntax highlighting">
        <Md />
      </Section>

      <Section title="Mermaid diagram">
        <Mermaid />
      </Section>

      <Section title="Tools" note="Pending, success, and error panels. Paths and patterns use toolArgument in the proposal.">
        <ReadTool state="pending" />
        <ReadTool state="success" expanded />
        <ReadTool state="error" />
        <CompactReadTool />
        <SkillReadTool />
        <BashTool state="pending" />
        <BashTool state="success" />
        <BashTool state="error" expanded />
        <GrepTool />
        <GrepTool state="error" />
        <FindTool />
        <LsTool />
        <WriteTool />
        <EditTool state="pending" />
        <EditTool />
        <EditTool state="error" />
        <GenericTool />
      </Section>

      <Section title="Direct shell commands (! and !!)">
        <DirectBash />
        <DirectBash excluded error />
      </Section>

      <Section title="Status lines">
        <WorkingIndicator />
        <StatusLine text="Reloaded keybindings, extensions, skills, prompts, themes, and context files" />
        <WarningLine text="Migrated credentials to auth.json: anthropic" />
        <ErrorLine text="models.json error: unexpected token" />
        <Line indent={1}><C t="success">✓ New session started</C></Line>
      </Section>

      <Section title="Editor and thinking levels" note="The editor border shows the thinking level; bash mode uses bashMode.">
        {THINKING_LEVELS.map((level) => (
          <div key={level}>
            <Line><C t="dim">thinking: {level}</C></Line>
            <Editor text={level === "off" ? "" : "Explain the theme loader"} border={thinkingToken(level)} />
          </div>
        ))}
        <Line><C t="dim">bash mode</C></Line>
        <Editor text="!ls themes" border="bashMode" bashMode />
      </Section>

      <Section title="Footer" note="Context percentage turns warning above 70% and error above 90%.">
        <Footer />
        <Line />
        <Footer context={78.2} />
        <Line />
        <Footer context={94.6} thinking="max" />
      </Section>

      <Section title="Autocomplete and extension select">
        <SelectList items={[{ label: "/settings", description: "Open settings" }, { label: "/model", description: "Select model" }, { label: "/tree", description: "Session tree" }, { label: "/resume", description: "Resume a session" }]} selected={1} />
        <Line />
        <Dialog title="Deploy target">
          <SelectList items={[{ label: "staging" }, { label: "production" }]} selected={0} />
        </Dialog>
      </Section>

      <Section title="Settings">
        <SettingsList items={SETTINGS} selected={0} />
      </Section>

      <Section title="Session tree" note="Selected row uses selectedBg; the proposal remaps the compaction label.">
        <SessionTree selected={6} />
      </Section>

      <Section title="Resume session">
        <SessionSelector selected={1} />
      </Section>

      <Section title="Model selector">
        <ModelSelector selected={2} />
      </Section>

      <Section title="Fullscreen: search, matches, scrollbar, jump indicator">
        <SearchBox query="" index={0} count={0} />
        <SearchBox query="theme" index={1} count={6} />
        <Line />
        <AssistantText>
          <Line>Pi reads the <SearchMatch>theme</SearchMatch> once, and the current <SearchMatch current>theme</SearchMatch> match is reversed.</Line>
        </AssistantText>
        <Line />
        <div className="scrollbar-demo">
          <ScrollbarCells rows={12} thumbTop={3} thumbHeight={4} />
          <ScrollbarCells rows={12} thumbTop={6} thumbHeight={4} active />
        </div>
        <JumpToLatest />
      </Section>
    </div>
    </TermScroll>
  );
}
