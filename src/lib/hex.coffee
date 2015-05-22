_ = require 'lodash'


shortestPath = (startHex, endHex) ->
    if not startHex? or not endHex?
        throw new Error "start/end missing"
    visited = new Set([String(startHex)])
    checkQueue = [[startHex, [startHex]]]
    while checkQueue.length > 0
        [elem, curPath] = checkQueue.shift()
        if _.isEqual elem, endHex
            return curPath
        adjacents = getAdjacent elem
        for j in adjacents
            if not visited.has String j
                visited.add String j
                p = _.cloneDeep curPath
                p.push j
                checkQueue.push [j, p]


getAdjacent = ([x, y]) ->
    return (
        if x%2 is 0
            [[x-1, y-1],[x-1, y],[x, y-1],[x, y+1],[x+1, y-1],[x+1, y]]
        else
            [[x-1, y],[x-1, y+1],[x, y-1],[x, y+1],[x+1, y],[x+1, y+1]]
    )


module.exports = {shortestPath, getAdjacent}
