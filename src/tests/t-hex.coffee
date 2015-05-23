expect = require('chai').expect

Hex = require "../lib/hex"

describe "Hex Algorithms", ->
    describe "shortest path", ->

        it "should be identity for matching start/end", ->
            path = Hex.shortestPath [1,1], [1,1]
            expect(path).to.deep.equal [[1,1]]

        it "work with path length 2", ->
            path = Hex.shortestPath [1,1], [1,2]
            expect(path).to.deep.equal [[1,1], [1,2]]


        it "work with path length many", ->
            path = Hex.shortestPath [1,1], [7,9]
            expect(path).to.deep.equal [ [ 1, 1 ],
                [ 1, 2 ],
                [ 1, 3 ],
                [ 1, 4 ],
                [ 1, 5 ],
                [ 1, 6 ],
                [ 2, 7 ],
                [ 3, 7 ],
                [ 4, 8 ],
                [ 5, 8 ],
                [ 6, 9 ],
                [ 7, 9 ] ]

        it "throw error on missing args", ->
            fn = -> Hex.shortestPath [1,1]
            expect(fn).to.throw /missing/

        it "excludes invalid tiles", ->
            validHexes = new Set ([
                String([0,0]),
                String([0,1]),
                String([0,2]),
                String([1,2]),
                String([2,2]),
                String([2,1]),
                String([2,0])
            ])
            path = Hex.shortestPath [0,0], [2,0], validHexes
            expect(path).to.deep.equal [[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0]]


    describe "distance", ->
        it "should work for identity", ->
            d = Hex.distance [4,1], [4,1]
            expect(d).to.equal 0
        it "should work for distance hexes", ->
            d = Hex.distance [4,1], [7,4]
            expect(d).to.equal 5
