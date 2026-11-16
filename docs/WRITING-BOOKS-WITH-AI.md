# Pagefork book-writing brief (for AI assistants)

> **How to use this file (for the person):** give this whole file to any AI chatbot (paste it, or attach it), then add a line like:
>
> `Topic: a haunted lighthouse on a stormy night. Players: 3. Length: medium. Audience: adults.`
>
> Save the reply as a file ending in `.ink` (for example `haunted-lighthouse.ink`), then in Pagefork tap **Import…** and choose it. If the app's writer shows errors, paste them back to the chatbot and ask it to fix them.

---

## Your task (for the AI)

You are writing an interactive choose-your-own-adventure book for **Pagefork**, a reading app. The book is written in **ink**, the scripting language by inkle. Pagefork adds a few conventions so that **several people can play the same book together**: on one phone passed around, or each on their own phone. Every choice in the book belongs to one character, and the person playing that character makes it.

The person will give you some of these. Use the default for anything they leave out:

| Input | Meaning | Default |
|---|---|---|
| **Topic** | What the story is about | Required; ask if missing |
| **Players** | Number of characters (1–8) | 2 |
| **Length** | short (≈10 choice points, 1,500–2,500 words), medium (≈20, 3,000–5,000 words), long (≈35, 6,000–10,000 words) | medium |
| **Audience** | children, teens or adults: sets vocabulary, peril and themes | teens |
| **Tone** | e.g. spooky, funny, heroic, mysterious | suits the topic |
| **Endings** | How many distinct endings | 3–5 |
| **Title / author** | For the book's cover | Invent a title; author "Pagefork AI" |

**Your reply must be one ink file, complete, in a single code block, and nothing else**, apart from at most two sentences before it. Don't split it across messages, don't abbreviate ("…rest of story…"), and don't leave TODOs.

---

## 1. The Pagefork conventions (required)

Put these lines at the very top of the file:

```ink
# title: The Book's Title
# author: Pagefork AI
# players: 3

VAR player1 = "Wren the Locksmith"
VAR player2 = "Pike the Lookout"
VAR player3 = "Sable the Talker"
```

- `# players: N` is the number of characters. It must equal the number of `playerN` variables.
- `VAR player1 … VAR playerN` are the characters' **default names**. Players can rename them before a game, so **never write a character's name directly in the text**: always write `{player1}`, `{player2}` and so on, in narration and in choice text alike. Give each character a short descriptive name ("Mara the Pilot" or just "Mara").
- **Who chooses:** put `# chooser: 2` **on its own line, directly before a set of choices**. That choice belongs to player 2. Use `# chooser: any` for urgent group moments where anyone may choose (online, the first to tap wins).
  - The tag must be on its own line, not on the same line as a choice.
  - If a set of choices has no `# chooser` tag, it belongs to whoever chose last (player 1 at the start). To be safe, **tag every set of choices**.
- **Write for a group:** everyone sees the same text, so narrate in the **third person** ("{player1} opens the door"), never "you". Avoid gendered pronouns for the characters, because players rename them: use their names, or "they".
- **Start each choice's text with the character who is choosing** when it helps, e.g. `* [{player2}: climb the wall]`.
- **Fairness:** share the choices out fairly between characters (roughly equal counts), and give each character a clear role or skill that their choices draw on. Every character should have at least one choice that really changes the story.
- **Any number of people can play:**
  - The book must also work when one person plays alone (they make every choice), and when fewer people play than there are characters (spare characters' choices go to a random player).
  - So never make a choice depend on who is actually holding the phone, and don't address players outside the story.
  - When **Players is 1**, write `# players: 1`, define only `player1`, and you may skip the `# chooser` tags.

---

## 2. The ink you may use

Stick to this subset; it is what Pagefork is tested with.

```ink
=== knot_name ===            // a section; names are lowercase_with_underscores, unique
Plain lines are story text.
# chapter: The Bridge        // optional chapter heading, on its own line
# chooser: 1
* [Choice text shown on the button]
    Text that appears after choosing it.
    ~ courage += 1           // change a variable
    -> another_knot          // jump to another section
* [Another choice]
    -> another_knot
* {courage >= 2} [Only shown if the condition is true]
    -> brave_path

=== another_knot ===
{courage > 1: Extra sentence only when brave.}
{ has_key:
    The door opens.
- else:
    The door is locked.
}
{~The wind howls.|Rain lashes the windows.|Thunder rolls.}   // random variety
-> END
```

- **Variables:** declare every variable at the top with `VAR name = value` (numbers, `true`/`false`, or "text"). Change them with `~ name = value`, `~ name += 1` or `~ name -= 1`. Use clear names (`trust`, `has_map`); players can see them in the Stats panel.
- **Choices:**
  - `*` choices disappear once picked, which is right for most choices.
  - Use `+` (sticky) for choices in a section the story can return to, such as a hub you can explore from. Otherwise the choices run out and the story breaks.
  - Text in `[brackets]` shows only on the button.
  - Every choice must lead somewhere: an indented line of text plus a `-> divert`, or a gather `-` line below the choices.
- **Diverts:** `-> knot_name` jumps to a section. Every section must end in a set of choices or a divert. A path must never just run out of text.
- **Endings:** every ending section starts with `# ending: short label` on its own line (e.g. `# ending: heroes`, `# ending: lost at sea`) and finishes with `-> END`. Pagefork counts the endings readers have found.
- **Optional presentation tags**, each on its own line:
  - `# clear` starts a fresh page. Use it sparingly, e.g. at a big scene change.
  - `# class: whisper` shows the next line in quiet italics.

**Don't use:** `INCLUDE`, `EXTERNAL`, tunnels (`->->`), threads (`<-`), `LIST`, functions, `TODO:` lines, or `# image:`, since the book won't have pictures. Don't write literal curly braces `{ }` in the story text, because ink treats them as code. Use `//` only for comments.

---

## 3. Story structure

- **Opening:** one short scene that introduces every character by `{playerN}` and shows the goal. The first choice comes within the first 150 words.
- **Branches with weight:** each choice should change something that matters: which scene comes next, a variable that later opens or closes an option, or how a later scene reads. Mix:
  - big forks (different routes that may rejoin later),
  - choices that set a variable which pays off later,
  - small flavour choices that rejoin straight away.
- **Rejoining:** let routes merge again so the book doesn't explode in size, but remember what happened (via variables) and refer to it.
- **Endings:**
  - Several distinct endings (good, bittersweet, bad and funny all count).
  - Every path must reach one; no dead ends, and no loops without a way out.
  - At least one ending should depend on choices made earlier (a variable check), not just the last choice.
- **Pacing:** about 100–250 words between choice points. Each set of choices offers 2–3 options, written as short actions.
- **Age-appropriate:** keep peril, language and themes suitable for the audience.

---

## 4. Complete example (2 players)

A small but complete book in the right shape (yours should be longer):

```ink
# title: The Night Market
# author: Pagefork AI
# players: 2

VAR player1 = "Juno the Juggler"
VAR player2 = "Tam the Tinker"

VAR coins = 3
VAR has_lantern = false

-> gates

=== gates ===
# chapter: Moonrise
The night market only opens once a year, and {player1} and {player2} have one hour to find the lost silver moth before the stalls vanish at dawn.
{~Lanterns bob overhead.|Music drifts from somewhere unseen.}
# chooser: 2
* [{player2}: trade a gear for a lantern]
    {player2} swaps a brass gear for a paper lantern that glows moth-blue.
    ~ has_lantern = true
    -> stalls
* [{player2}: save the gear for later]
    {player2} pockets the gear. Better to keep something to bargain with.
    ~ coins += 1
    -> stalls

=== stalls ===
Two paths lead deeper: a noisy alley of fortune tellers, and a silent row of glassblowers.
# chooser: 1
* [{player1}: juggle for the fortune tellers]
    {player1} juggles three oranges and a teacup. The fortune tellers applaud and point towards the river.
    -> river
* [{player1}: tiptoe past the glassblowers]
    -> glass

=== glass ===
The glassblowers' shelves rattle at the slightest sound.
# chooser: any
* [Hold your breath and keep walking]
    Not a single bottle falls. At the end of the row, a door opens onto the river.
    -> river
* [Run for it]
    Bottles shatter in a glittering wave. The market wakes up shouting.
    ~ coins -= 2
    -> river

=== river ===
# chapter: The River
The silver moth flutters above the black water, just out of reach.
{has_lantern: It turns towards the moth-blue glow of the lantern.}
# chooser: 2
* {has_lantern} [{player2}: raise the lantern]
    The moth settles on the lantern, calm as a sleeping cat.
    -> ending_moth
* [{player2}: build a net from wire and string]
    {coins >= 3:
        {player2} buys string with the last coins and builds a net in a minute flat.
        -> ending_moth
    - else:
        There aren't enough coins left for string. The moth drifts away over the water.
        -> ending_dawn
    }

=== ending_moth ===
# ending: moth found
{player1} and {player2} walk home at sunrise with the silver moth glowing between them, and the market's music still in their ears.
-> END

=== ending_dawn ===
# ending: gone at dawn
The stalls fold away into the morning mist. {player1} and {player2} are left holding nothing but a story, which, they agree, is not nothing.
-> END
```

---

## 5. Check before you reply

Go through this list and fix anything that fails:

1. The top has `# title`, `# author` and `# players: N`, and exactly N `VAR playerK` lines.
2. Character names appear **only** as `{player1}`, `{player2}` and so on, never written out, including in choice text and endings.
3. Every set of choices has a `# chooser: …` line **on its own line directly above it**, and choices are shared fairly between the characters.
4. Every `-> name` points to a section that exists, and section names are unique and lowercase_with_underscores.
5. Every variable used is declared at the top with `VAR`.
6. Every path reaches an ending. Each ending starts with `# ending: …` and finishes with `-> END`, and there are no dead ends or endless loops.
7. Sections the story can come back to use `+` choices.
8. There are no literal `{ }` in story text, and none of the features listed under "Don't use".
9. The story is narrated in the third person, and the length, tone and audience match the request.
10. The reply is one complete ink file in one code block.
