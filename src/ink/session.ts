import { StoryEngine, type Choice } from './engine';
import { findTag } from './tags';
import type { TranscriptEntry, UndoEntry } from '../book/types';

export interface SessionSnapshot {
  inkState: string;
  transcript: TranscriptEntry[];
  undo: UndoEntry[];
}

const MAX_UNDO = 200;

/**
 * Reading session: owns the engine, the visible transcript and the undo stack.
 * UI-agnostic so it can be unit-tested and reused by the writer's preview.
 */
export class ReaderSession {
  readonly engine: StoryEngine;
  transcript: TranscriptEntry[] = [];
  undoStack: UndoEntry[] = [];

  constructor(storyJson: string) {
    this.engine = new StoryEngine(storyJson);
  }

  start(): void {
    this.engine.reset();
    this.transcript = [];
    this.undoStack = [];
    this.advance();
  }

  restore(snap: SessionSnapshot): void {
    this.engine.loadState(snap.inkState);
    this.transcript = snap.transcript;
    this.undoStack = snap.undo;
  }

  snapshot(): SessionSnapshot {
    return { inkState: this.engine.saveState(), transcript: this.transcript, undo: this.undoStack };
  }

  get choices(): Choice[] {
    return this.engine.choices;
  }

  get ended(): boolean {
    return this.engine.ended;
  }

  /** The value of the last `# ending:` tag seen, if the story has ended. */
  get ending(): string | null {
    if (!this.ended) return null;
    for (let i = this.transcript.length - 1; i >= 0; i--) {
      const e = this.transcript[i];
      const v = findTag(e.tags, 'ending');
      if (v !== undefined) return v || 'ending';
      if (e.kind === 'choice') break;
    }
    return 'ending';
  }

  choose(index: number): void {
    const choice = this.engine.choices.find((c) => c.index === index);
    if (!choice) throw new Error(`No choice with index ${index}`);
    this.undoStack = [...this.undoStack, { inkState: this.engine.saveState(), transcriptLength: this.transcript.length }].slice(-MAX_UNDO);
    this.transcript = [...this.transcript, { kind: 'choice', text: choice.text, tags: choice.tags }];
    this.engine.choose(index);
    this.advance();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last) return;
    this.engine.loadState(last.inkState);
    this.transcript = this.transcript.slice(0, last.transcriptLength);
    this.undoStack = this.undoStack.slice(0, -1);
  }

  private advance(): void {
    const passages = this.engine.continue();
    this.transcript = [...this.transcript, ...passages.map((p) => ({ kind: 'text' as const, text: p.text, tags: p.tags }))];
  }
}
