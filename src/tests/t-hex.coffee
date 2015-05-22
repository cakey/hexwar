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
