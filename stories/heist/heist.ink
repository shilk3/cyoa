# title: The Clocktower Heist
# author: cyoa-reader sample
# players: 3

// Character names: these are the defaults; players can rename them before a game.
VAR player1 = "Wren the Locksmith"
VAR player2 = "Pike the Lookout"
VAR player3 = "Sable the Talker"

VAR alarm = 0
VAR has_ledger = false
VAR guard_friendly = false

-> square

=== square ===
# chapter: Midnight
The town clock strikes twelve. Below it, three figures meet in the shadow of the fountain: {player1}, {player2} and {player3}.
Somewhere inside the clocktower is the mayor's secret ledger, and tonight it is coming out.
{~A cat watches from a windowsill.|Fog curls around the lampposts.|A cart rattles past and is gone.}

# chooser: 2
* [{player2}: take the rooftops to scout ahead]
    {player2} scrambles up a drainpipe and runs along the ridge tiles. From up here the whole plan looks easy. Almost.
    -> rooftop
* [{player2}: stay below and watch the street]
    {player2} melts into a doorway, eyes on both ends of the street.
    -> tower_door

=== rooftop ===
A guard is pacing the clocktower balcony, yawning.
# chooser: 3
* [{player3}: distract the guard with a story]
    "Officer!" {player3} calls up, waving. "My cart's lost a wheel, and my mother's in it!" It is not a good story. The guard comes down anyway.
    ~ guard_friendly = true
    -> tower_door
* [{player3}: wait for the guard to go inside]
    The guard yawns again and wanders inside, taking far too long about it.
    ~ alarm += 1
    -> tower_door

=== tower_door ===
# chapter: The Door
The tower door has three locks, each fancier than the last.
# chooser: 1
* [{player1}: pick the locks one by one]
    {player1}'s picks whisper in the keyholes. Click. Click. ... Click.
    -> stairs
* [{player1}: try the coal chute instead]
    {player1} squeezes down the coal chute and comes out somewhere warm, dark and very sooty.
    ~ alarm += 1
    -> stairs

=== stairs ===
Inside, two hundred steps wind up into the dark. Halfway up, a bell rope hangs across the stairs.
# chooser: any
* [Duck under the rope]
    Everyone ducks. Nobody touches the rope. Everyone is very proud of themselves.
    -> office
* [Step over the rope]
    Someone's boot catches it. A single low BONG rolls across the town.
    ~ alarm += 2
    -> office

=== office ===
# chapter: The Office
The mayor's office smells of wax and old money. The ledger sits on the desk, chained to a brass ring.
{alarm >= 2: Outside, whistles are blowing. Time is short.}
# chooser: 1
* [{player1}: cut the chain]
    The chain parts with a snap.
    ~ has_ledger = true
    -> escape
* [{player1}: copy the important pages instead]
    {player1} copies furiously by candlelight while {player2} keeps watch at the door.
    ~ has_ledger = true
    ~ alarm += 1
    -> escape

=== escape ===
# chapter: Out
Footsteps on the stairs below. {guard_friendly: It's the guard from the balcony, puffing and confused.|Someone is coming up, fast.}
# chooser: 3
* {guard_friendly} [{player3}: talk your way past the guard]
    "Thank goodness, officer! We heard a noise and came to help!" The guard thanks {player3} warmly and holds the door.
    -> ending_clean
* [{player3}: bluff that you are the mayor's cleaners]
    {alarm < 3:
        The bluff holds, just. Nobody looks closely at the ledger under the mop bucket.
        -> ending_clean
    - else:
        Nobody believes it. Not with the whistles going.
        -> ending_chase
    }
* [Everyone: run for the roof]
    -> ending_chase

=== ending_clean ===
# ending: clean getaway
By sunrise the ledger is on the newspaper editor's desk, and {player1}, {player2} and {player3} are eating breakfast across the square, watching the mayor's carriage leave town in a hurry.
-> END

=== ending_chase ===
# ending: rooftop chase
It's a long, loud night over the rooftops of the town, but {player2} knows every gutter and gable. By dawn the three of them are miles away, the ledger safe, the town's whistles still blowing.
-> END
