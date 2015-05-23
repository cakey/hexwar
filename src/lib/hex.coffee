_ = require 'lodash'


shortestPath = (startHex, endHex, validHexes) ->
    if not startHex? or not endHex?
        throw new Error "start/end missing"
    visited = new Set([String(startHex)])
    checkQueue = [[startHex, [startHex]]]
    while checkQueue.length > 0
        [elem, curPath] = checkQueue.shift()
        if _.isEqual elem, endHex
            return curPath
        adjacents = getAdjacent elem, validHexes
        for j in adjacents
            if not visited.has String j
                visited.add String j
                p = _.cloneDeep curPath
                p.push j
                checkQueue.push [j, p]


getAdjacent = ([x, y], validHexes) ->
    returnees =  (
        if x%2 is 0
            [[x-1, y-1],[x-1, y],[x, y-1],[x, y+1],[x+1, y-1],[x+1, y]]
        else
            [[x-1, y],[x-1, y+1],[x, y-1],[x, y+1],[x+1, y],[x+1, y+1]]
    )
    (r for r in returnees when (not validHexes? or validHexes.has String(r)))

cubeDistance = (a, b) ->
    (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2

toCube = ([col,row]) ->
    x = col
    z = row - (col - (col&1)) / 2
    y = -x-z
    return [x,y,z]

distance = (hex1, hex2) ->
    cube1 = toCube hex1
    cube2 = toCube hex2
    cubeDistance cube1, cube2

module.exports = {
    shortestPath
    getAdjacent
    distance
}
