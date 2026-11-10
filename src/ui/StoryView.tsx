import { useEffect, useRef, type ReactNode } from 'react';
import type { Choice } from '../ink/engine';
import type { TranscriptEntry } from '../book/types';
import { parseTag } from '../ink/tags';

interface Props {
  transcript: TranscriptEntry[];
  choices: Choice[];
  ended: boolean;
  ending?: string | null;
  assetUrls: Record<string, string>;
  onChoose: (index: number) => void;
  onRestart?: () => void;
  /** Multiplayer: shown above the choices (whose turn it is). */
  choicesHeader?: ReactNode;
  /** Multiplayer: someone else is choosing, so the choices are shown but can't be tapped. */
  choicesDisabled?: boolean;
  /** Scrolls the newest content into view after each choice. */
  scrollContainer?: React.RefObject<HTMLElement | null>;
}

/** Index of the entry after the last `# clear` tag, so earlier text is hidden like a page turn. */
function pageStart(transcript: TranscriptEntry[]): number {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].tags.some((t) => parseTag(t).key === 'clear')) return i;
  }
  return 0;
}

export function StoryView({ transcript, choices, ended, ending, assetUrls, onChoose, onRestart, choicesHeader, choicesDisabled, scrollContainer }: Props) {
  const lastChoiceRef = useRef<HTMLParagraphElement | null>(null);
  const start = pageStart(transcript);
  const visible = transcript.slice(start);
  const lastChoiceIdx = visible.map((e) => e.kind).lastIndexOf('choice');

  useEffect(() => {
    if (lastChoiceRef.current) {
      lastChoiceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      (scrollContainer?.current ?? window).scrollTo?.({ top: 0 });
    }
  }, [transcript.length, scrollContainer]);

  return (
    <div className="story">
      {visible.map((e, i) => {
        if (e.kind === 'choice') {
          return (
            <p key={start + i} className="picked" ref={i === lastChoiceIdx ? lastChoiceRef : undefined}>
              {e.text}
            </p>
          );
        }
        let cls = '';
        const extras: React.ReactNode[] = [];
        e.tags.forEach((t, j) => {
          const { key, value } = parseTag(t);
          if (key === 'chapter' && value) extras.push(<h2 key={`c${j}`} className="chapter">{value}</h2>);
          if (key === 'image' && value) {
            extras.push(
              assetUrls[value] ? (
                <img key={`i${j}`} src={assetUrls[value]} alt="" />
              ) : (
                <p key={`i${j}`} className="missing">[missing image: {value}]</p>
              ),
            );
          }
          if (key === 'class') cls = value;
        });
        return (
          <div key={start + i} className={`passage fresh-${i > lastChoiceIdx}`}>
            {extras}
            {e.text.trim() && <p className={cls}>{e.text}</p>}
          </div>
        );
      })}

      {choices.length > 0 && choicesHeader}
      {choices.length > 0 && (
        <div className={`choices ${choicesDisabled ? 'waiting' : ''}`} role="group" aria-label="Choices">
          {choices.map((c) => (
            <button key={c.index} className="choice" disabled={choicesDisabled} onClick={() => onChoose(c.index)}>
              {c.text}
            </button>
          ))}
        </div>
      )}

      {ended && (
        <div className="the-end">
          <p className="end-mark">THE END</p>
          {ending && ending !== 'ending' && <p className="ending-kind">Ending: {ending}</p>}
          {onRestart && (
            <button className="btn" onClick={onRestart}>
              Read again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
