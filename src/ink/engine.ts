import { Story } from 'inkjs';

export interface Passage {
  text: string;
  tags: string[];
}

export interface Choice {
  index: number;
  text: string;
  tags: string[];
}

export class StoryEngine {
  private story: Story;

  constructor(storyJson: string) {
    this.story = new Story(storyJson);
  }

  get globalTags(): string[] {
    return this.story.globalTags ?? [];
  }

  /** Runs the story until the next choice point (or the end). */
  continue(): Passage[] {
    const out: Passage[] = [];
    while (this.story.canContinue) {
      const text = this.story.Continue() ?? '';
      out.push({ text: text.replace(/\n$/, ''), tags: this.story.currentTags ?? [] });
    }
    return out;
  }

  get choices(): Choice[] {
    return this.story.currentChoices.map((c) => ({ index: c.index, text: c.text, tags: c.tags ?? [] }));
  }

  choose(index: number): void {
    this.story.ChooseChoiceIndex(index);
  }

  get ended(): boolean {
    return !this.story.canContinue && this.story.currentChoices.length === 0;
  }

  saveState(): string {
    return this.story.state.ToJson();
  }

  loadState(json: string): void {
    this.story.state.LoadJson(json);
  }

  reset(): void {
    this.story.ResetState();
  }

  get variables(): Record<string, unknown> {
    const vs = this.story.variablesState;
    const out: Record<string, unknown> = {};
    // variablesState is a Proxy whose own keys are the global variable names.
    for (const name of Object.keys(vs)) {
      out[name] = vs.$(name);
    }
    return out;
  }
}
