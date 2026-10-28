import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

interface State {
  inBlockComment: boolean;
  lineStart: boolean;
}

/** Lightweight ink highlighter: enough structure to scan a story at a glance. */
const inkStream = StreamLanguage.define<State>({
  name: 'ink',
  startState: () => ({ inBlockComment: false, lineStart: true }),
  token(stream, state) {
    if (stream.sol()) state.lineStart = true;
    if (state.inBlockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inBlockComment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'comment';
    }
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (state.lineStart) {
      stream.eatSpace();
      if (stream.match(/^={2,}\s*(function\s+)?[\w.]*/)) {
        state.lineStart = false;
        return 'heading';
      }
      if (stream.match(/^=\s*\w+/)) {
        state.lineStart = false;
        return 'heading';
      }
      if (stream.match(/^((\*|\+)\s*)+/)) {
        state.lineStart = false;
        return 'keyword';
      }
      if (stream.match(/^(-\s*)+(?!>)/)) {
        state.lineStart = false;
        return 'operator';
      }
      if (stream.match(/^(VAR|CONST|LIST|INCLUDE|EXTERNAL)\b/)) {
        state.lineStart = false;
        return 'definitionKeyword';
      }
      if (stream.match('~')) {
        stream.skipToEnd();
        state.lineStart = false;
        return 'variableName';
      }
      if (stream.match(/^TODO:?/)) {
        stream.skipToEnd();
        return 'comment';
      }
      state.lineStart = false;
    }
    if (stream.match(/^(->|<-)\s*[\w.]*/)) return 'link';
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'meta';
    }
    if (stream.match(/^\[[^\]]*\]/)) return 'string';
    if (stream.match(/^\{[^}]*\}/)) return 'variableName';
    stream.next();
    return null;
  },
});

const inkHighlight = HighlightStyle.define([
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.heading, color: 'var(--syn-heading)', fontWeight: 'bold' },
  { tag: t.keyword, color: 'var(--syn-choice)', fontWeight: 'bold' },
  { tag: t.operator, color: 'var(--syn-choice)' },
  { tag: t.definitionKeyword, color: 'var(--syn-var)', fontWeight: 'bold' },
  { tag: t.variableName, color: 'var(--syn-var)' },
  { tag: t.link, color: 'var(--syn-divert)' },
  { tag: t.meta, color: 'var(--syn-tag)' },
  { tag: t.string, color: 'var(--syn-bracket)' },
]);

export const inkLanguage = [inkStream, syntaxHighlighting(inkHighlight)];
