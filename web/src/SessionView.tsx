import type { ReactNode } from "react";
import {
  AssistantText, BashTool, CodeBlock, CompactionMessage, CustomMessage, DirectBash, EditTool, Editor, Footer, GrepTool, Header,
  JumpToLatest, MdTable, ModelSelector, ReadTool, SearchBox, SearchMatch, SelectList, SessionSelector, SessionTree,
  SettingsList, ThinkingBlock, UserMessage, WarningLine, WorkingIndicator, thinkingToken,
} from "./pi-elements.tsx";
import { SETTING_CHOICES, suggestions, type SessionState } from "./session-state.ts";
import { C, Line } from "./term.tsx";
import { TermScroll } from "./term-scroll.tsx";

/** Highlights search matches for "theme" in one transcript sentence. */
function Searchable({ text, state, offset }: { text: string; state: SessionState; offset: number }) {
  const query = state.overlay === "search" ? state.searchQuery.toLowerCase() : "";
  if (!query) return <>{text}</>;
  const parts: ReactNode[] = [];
  let rest = text;
  let n = offset;
  while (rest) {
    const at = rest.toLowerCase().indexOf(query);
    if (at < 0) { parts.push(rest); break; }
    parts.push(rest.slice(0, at));
    parts.push(<SearchMatch key={n} current={n === state.searchIndex}>{rest.slice(at, at + query.length)}</SearchMatch>);
    rest = rest.slice(at + query.length);
    n++;
  }
  return <>{parts}</>;
}

function Transcript({ state }: { state: SessionState }) {
  const hideThinking = state.settings["Hide thinking"] === "true" || !state.thinkingVisible;
  return (
    <>
      <Header />
      <UserMessage>Can you explain how theme loading works, and add an optional footerText token?</UserMessage>
      <ThinkingBlock collapsed={hideThinking} />
      <AssistantText>
        <Line><Searchable state={state} offset={0} text="Pi loads the theme at startup. Let me read the theme loader first." /></Line>
      </AssistantText>
      <ReadTool state="success" expanded={state.expanded} />
      <GrepTool />
      <AssistantText>
        <Line><C t="mdHeading" bold>## How it works</C></Line>
        <Line />
        <Line><Searchable state={state} offset={1} text="Each theme resolves variables, then " /><C t="mdCode">withThemeColorFallbacks()</C> fills optional tokens.</Line>
        <Line><C t="mdListBullet">- </C>Built-in themes: <C t="mdLink" underline>dark.json</C> and light.json</Line>
        <Line><C t="mdListBullet">- </C><Searchable state={state} offset={2} text="Custom themes live in ~/.pi/agent/themes" /></Line>
        <Line />
        <CodeBlock />
        <Line />
        <MdTable />
      </AssistantText>
      <EditTool />
      <BashTool state="success" expanded={state.expanded} />
      <DirectBash />
      <CustomMessage label="figma-plugin">Selection changed: 2 nodes.</CustomMessage>
      <CompactionMessage expanded={state.expanded} />
      <WarningLine text="Cache miss after model switch: 74k tokens re-billed (~$0.33)" />
      <BashTool state="pending" />
      <WorkingIndicator />
    </>
  );
}

function Overlay({ state }: { state: SessionState }) {
  switch (state.overlay) {
    case "settings":
      return <SettingsList selected={state.selected} items={Object.keys(SETTING_CHOICES).map((label) => ({ label, value: state.settings[label], description: label === "Auto-compact" ? "Automatically compact context when it gets too large" : undefined }))} />;
    case "tree": return <SessionTree selected={state.selected} />;
    case "resume": return <SessionSelector selected={state.selected} />;
    case "model": return <ModelSelector selected={state.selected} />;
    default: return null;
  }
}

export function SessionView({ state }: { state: SessionState }) {
  const matches = suggestions(state);
  const searchCount = state.searchQuery ? 3 : 0;
  return (
    <div className="session">
      <TermScroll startAtEnd jumpToLatest={<JumpToLatest />}>
        <Transcript state={state} />
      </TermScroll>
      {state.overlay === "search" && <SearchBox query={state.searchQuery} index={((state.searchIndex % 3) + 3) % 3} count={searchCount} />}
      {state.overlay !== "none" && state.overlay !== "search" ? (
        <div className="overlay"><Overlay state={state} /></div>
      ) : (
        <>
          <Editor text={state.input} border={thinkingToken(state.thinking)} bashMode={state.input.startsWith("!")} />
          {matches.length > 0 && <SelectList items={matches} selected={state.selected % matches.length} />}
        </>
      )}
      <Footer thinking={state.thinking} />
    </div>
  );
}
