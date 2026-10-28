# title: The Lighthouse Keeper
# author: cyoa-reader sample

VAR lamp_oil = 2
VAR has_key = false
VAR courage = 0

-> arrival

=== arrival ===
# chapter: Arrival
The ferry leaves you on the rocks just as the sun sinks. Above you, the lighthouse is dark. It should have been lit an hour ago.

A storm is building on the horizon. Somewhere out there, the evening boat is coming home.

* [Climb the path to the lighthouse]
    You shoulder your bag and start up the slippery steps.
    -> lighthouse_door
* [Search the boathouse first]
    -> boathouse

=== boathouse ===
The boathouse smells of tar and salt. Ropes hang from the rafters like sleeping snakes.
* [Check the workbench]
    Under a pile of rags you find a heavy iron key, tagged "LAMP ROOM".
    ~ has_key = true
* [Take the spare oil can]
    It sloshes. Not full, but it's something.
    ~ lamp_oil += 1
- You hurry back out into the rising wind.
-> lighthouse_door

=== lighthouse_door ===
# clear
The lighthouse door hangs open, banging in the wind. Inside, a spiral staircase climbs into darkness. From somewhere above comes a faint tapping.
* [Call out]
    "Hello? Mr. Abernathy?"
    The tapping stops.
    ~ courage += 1
    -> stairs
* [Climb quietly]
    -> stairs

=== stairs ===
# chapter: The Stairs
Halfway up, a figure blocks the stairs: the old keeper, Abernathy, pale and shaking, holding a lantern that has gone out.
"The lamp room's locked," he whispers. "I dropped the key. And I heard something up there."
* {has_key} [Show him the key]
    His eyes widen. "Bless you. Go — I'll follow."
    -> lamp_room
* [Offer to break the door down]
    ~ courage += 1
    "It's oak," he says doubtfully. "But try."
    -> force_door
* [Suggest you both leave]
    -> flee

=== force_door ===
You throw your shoulder against the door.
{ courage >= 2:
    On the second blow the old lock gives way.
    -> lamp_room
- else:
    It doesn't budge. Your shoulder throbs. Below, you hear a boat horn — far too close to the rocks.
    * [Try once more]
        ~ courage += 1
        -> force_door
    * [Give up and go down]
        -> flee
}

=== lamp_room ===
# chapter: The Lamp Room
The lamp room is empty, apart from a gull battering itself against the glass. So that was the tapping.
You open a pane and it bursts free into the storm.
The great lamp is cold. The reservoir holds {lamp_oil} measure{lamp_oil != 1:s} of oil.
* [Light the lamp]
    -> light_lamp

=== light_lamp ===
{ lamp_oil >= 3:
    The flame catches and swells. The lens turns, and a white beam sweeps across the waves.
    Far below, the evening boat swings away from the rocks.
    -> good_ending
- else:
    The flame catches, flickers... and settles low. It's dim, but it's light.
    -> uncertain_ending
}

=== flee ===
You help Abernathy down the stairs and out into the rain. Behind you the lighthouse stands dark against the storm.
At dawn, you learn the evening boat ran aground. Everyone made it ashore, but the boat is lost.
-> bad_ending

=== good_ending ===
# ending: good
In the morning the fishermen climb the hill to shake your hand. Abernathy offers you the job. You say yes.
-> END

=== uncertain_ending ===
# ending: neutral
You stand by the lamp until dawn, willing it to burn. When the storm clears, the boat is tied up safe in the harbour — though the skipper says it was a close thing.
Maybe next time, check the boathouse for more oil.
-> END

=== bad_ending ===
# ending: bad
The lighthouse stays dark for the rest of the season.
-> END
