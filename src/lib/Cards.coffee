Hex = require '../lib/Hex'

Cards =
    Influence:
        description: "Watchtower"
        allowed: (tM, hex, team) ->
            tM.adjacentToTeam(hex, team) and tM.getTeam(hex) in [team, null]
        newStates: (tM, hex, availableHexes) ->
            states =
                captured: []
            adjs = Hex.getAdjacent hex, availableHexes
            for h in adjs
                if not tM.getTeam(h)?
                    states.captured.push h
            if not tM.getTeam(hex)?
                states.captured.push hex
            states

    Barracks:
        description: "Barracks"
        allowed: (tM, hex, team) ->
            tM.getTeam(hex) is team
        newStates: (tM, hex, availableHexes) ->
            captured: []

module.exports = Cards
