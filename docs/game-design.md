# HexWar Game Design

## Vision

HexWar is a short, deterministic, turn-based game about projecting influence
over a shared hexagonal battlefield. It has no attacks, damage, currency, hidden
information, or randomness. Positioning is the weapon: coordinated pieces claim
territory, force retreats, and create a visible path to domination.

The target is a readable 1v1 match lasting roughly 10–20 minutes. Each player
controls only five meaningful pieces, and every committed action passes control
to the opponent.

## Match setup

- The initial board contains 85 tiles in 13 staggered columns.
- Violet begins on the left and Crimson begins on the right.
- Each roster contains two Scouts, two Standards, and one Anchor.
- One Scout, one Standard, and the Anchor begin deployed.
- The second Scout and Standard begin ready in reserve.
- The two outermost columns on each side form that team's home zone.
- The game is perfect-information and deterministic.

## Turn structure

A player commits exactly one normal action per turn:

- Move one deployed piece.
- Deploy one ready reserve piece into its home zone.
- Deploy or pack an Anchor.
- Pass.

Selecting pieces and inspecting candidate actions is free. A candidate becomes a
planned action and does not change the match until the player confirms it.

After confirmation:

1. The normal action is applied.
2. Influence and territory are recalculated.
3. Previously pressured friendly pieces that are now safe recover.
4. Previously pressured pieces that remain pressured enter free retreat planning.
5. All chosen retreats resolve together; pieces without a legal retreat are routed.
6. Newly pressured pieces receive warning markers for their next turn.
7. Cooldowns and dominance are updated.
8. Control passes to the opponent.

## Action preview

Every deterministic consequence is visible before confirmation:

- The candidate piece appears as a ghost at its destination.
- The path and legal range are highlighted.
- Tiles show projected control, loss, or contention.
- Territory totals show their projected values.
- Pieces that become pressured, recover, retreat, or route are marked.
- Confirm and cancel controls remain available until commitment.

Retreats use the same planning interface. When several pieces must retreat, the
player plans every destination before confirming the group.

## Unit roles and influence

Influence is additive and uses small visible integer values. A tile belongs to
the team with the greater total influence; equal non-zero values are contested,
and zero influence is neutral.

| Piece            | Movement | Own tile | Ring 1 | Ring 2 | Ring 3 |
| ---------------- | -------: | -------: | -----: | -----: | -----: |
| Scout            |        2 |        2 |      1 |      — |      — |
| Standard         |        1 |        3 |      2 |      1 |      — |
| Anchor, packed   |        1 |        2 |      1 |      — |      — |
| Anchor, deployed |        0 |        4 |      3 |      2 |      1 |

- Scouts trade influence for mobility.
- Standards provide the dependable center of a formation.
- Anchors move while packed and spend a full action deploying or packing.
- A forced Anchor retreat always returns it to its packed state.
- Pieces may not move through or onto occupied tiles.
- Movement through enemy-controlled territory is legal.

Selecting a tile can reveal exact influence values, but the default board uses
color saturation and contested patterns rather than permanent numeric clutter.

## Pressure, retreat, and routing

A piece is pressured whenever the opposing team controls its tile. New pressure
is a warning, not immediate displacement. On the owner's next turn, their one
normal action may move the piece, reinforce it, deploy support, or alter an
Anchor. Only pieces that were pressured at the start of that turn are due to
retreat during its resolution.

A retreat:

- Is free and moves exactly one adjacent tile.
- Cannot move toward the opposing home side.
- Must use an unoccupied destination unique among simultaneous retreats.
- Must finish on a friendly-controlled or contested tile after all retreats.

If no legal retreat exists, the piece is routed instead of permanently removed:

- It leaves the board and enters cooldown.
- It cannot deploy during its owner's next turn.
- It becomes ready in reserve on the following turn.
- Redeployment consumes a future normal action.
- A routed Anchor returns packed.

Routing creates a major loss of territory, position, and tempo without producing
an irreversible material snowball.

## Victory

A team begins dominance when it controls at least 60% of the board after all
retreats resolve. The opponent receives one complete response turn. If the
claiming team still controls at least 60% after that response and its retreats,
it wins.

Losing the threshold cancels dominance. The interface always displays the active
claim and response window. A 40-round safety limit ends prototype stalemates by
territory count; equal territory is a draw.

## Initial modes

- Human versus AI
- Local hotseat
- Headless AI versus AI for balance simulation

Online multiplayer, alternate boards, terrain, additional roles, factions, and
metagame progression remain outside the first rules prototype.

## Playtest questions

- Is one action enough to create meaningful responses without feeling slow?
- Does the 60% threshold produce dramatic recoverable endgames?
- Are free retreats sufficiently costly without permanent elimination?
- Does deploying reserves create varied openings rather than a forced sequence?
- Are deployed Anchors powerful without making positions static?
- Does either starting side have a measurable advantage?
