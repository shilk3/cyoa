const SECTIONS: { title: string; body: string; code: string }[] = [
  {
    title: 'Text and choices',
    body: 'Plain lines are story text. Lines starting with * are choices. Text in [brackets] shows only on the button, not after picking it.',
    code: `You reach a fork in the road.
* [Go left]
    You take the left path.
* [Go right]
    You take the right path.
- The paths meet again by a river.`,
  },
  {
    title: 'Knots and diverts',
    body: 'Split your story into named sections (knots) and jump between them with ->. End the story with -> END.',
    code: `=== cave ===
It is dark in here.
* [Light a torch] -> lit_cave
* [Leave] -> END`,
  },
  {
    title: 'Sticky choices',
    body: '* choices disappear once picked. + choices stay, which is useful for hubs and loops.',
    code: `=== market ===
+ [Buy bread] -> buy_bread
+ [Leave] -> square`,
  },
  {
    title: 'Variables and conditions',
    body: 'Declare variables with VAR, change them with ~, and show or hide choices with {conditions}.',
    code: `VAR gold = 5
~ gold -= 2
You have {gold} gold coins.
* {gold >= 3} [Buy the sword]
{ gold > 0:
    Your purse jingles.
- else:
    Your purse is empty.
}`,
  },
  {
    title: 'Visits and variety',
    body: 'A knot name is also how many times it has been seen. {a|b|c} cycles text, {~a|b} picks at random.',
    code: `{cave: You've been here before.}
The guard {shrugs|sighs|ignores you}.`,
  },
  {
    title: 'Reader tags',
    body: 'Tags start with # and control how this app presents the story.',
    code: `# title: My Book        (top of file)
# author: Your Name      (top of file)
# chapter: Part One      (chapter heading)
# clear                  (start a fresh page)
# image: assets/map.png  (show an image)
# class: whisper         (style a line)
# ending: good           (mark an ending)`,
  },
];

export function InkHelp() {
  return (
    <div className="help">
      <p className="muted small">
        Ink is a scripting language for branching stories made by inkle. Full guide:{' '}
        <a href="https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md" target="_blank" rel="noreferrer">
          Writing with Ink
        </a>
        .
      </p>
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
          <pre>{s.code}</pre>
        </section>
      ))}
    </div>
  );
}
