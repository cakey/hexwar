_ = require 'lodash'
React = require 'React'

PrismGeometry = require './PrismGeometry'
Hex = require '../lib/Hex'
# Skill = require './skill'
# SkillBarrier = require './skill'

Colors =
    purple: "#9b59b6"
    darkPurple: "#8e44ad"
    red: "#e74c3c"
    darkRed: "#c0392b"
    selected: "#bdc3c7"
    white: "#ffffff"
    baseTile: "#00b2fc"
    highlightTile: "#f39c12"
    pathTile: "#2ecc71"
    outofrangeTile: "grey"


WIDTH = window.innerWidth
HEIGHT = window.innerHeight

VIEW_ANGLE = 70
ASPECT = WIDTH/HEIGHT
NEAR = 0.1
FAR = 10000


renderer = new THREE.WebGLRenderer({ antialias: true })

camera = new THREE.PerspectiveCamera(VIEW_ANGLE,ASPECT,NEAR,FAR)

scene = new THREE.Scene()

scene.add camera

cameraDistance = 125

camera.position.x = 765
camera.position.y = -4 * cameraDistance
camera.position.z = 4 * cameraDistance
camera.rotation.x = Math.PI/4
camera.rotation.y = 0
camera.rotation.z = 0

pointLight = new THREE.PointLight(0xFFFFFF)

pointLight.position.x = 700
pointLight.position.y = -250
pointLight.position.z = 500

# scene.add(pointLight) This is not doing anything atm

TEAM_NAMES = ["Purple", "Red"]

makeHexGeometry = (halfEdge, height) ->
    stalk = halfEdge*Math.tan(Math.PI/3)
    BOTTOM_LEFT = new THREE.Vector2( -halfEdge, -stalk )
    BOTTOM_RIGHT = new THREE.Vector2( halfEdge, -stalk )
    TOP_LEFT = new THREE.Vector2( -halfEdge, stalk )
    TOP_RIGHT = new THREE.Vector2( halfEdge, stalk )
    LEFT = new THREE.Vector2( -halfEdge*2, 0 )
    RIGHT = new THREE.Vector2( +halfEdge*2, 0 )

    tileHeight = height#3

    new PrismGeometry( [ BOTTOM_LEFT, BOTTOM_RIGHT, RIGHT, TOP_RIGHT, TOP_LEFT, LEFT ], tileHeight )

halfEdge = 40
tileHeight = 3
hexGeometry = makeHexGeometry(halfEdge, tileHeight)

hexagons = new THREE.Object3D();

hexTo3d = ([hexX, hexY]) ->
    border = 12
    _edge = halfEdge*2

    # fractional with offset coordinates
    extra = hexX%2
    percentOffset = if extra < 1 then extra else 2 - extra


    x: (((_edge)*3/2)+(border*(2/3))) * hexX
    y: ((_edge*Math.sqrt(3)+border) * (hexY + (percentOffset*0.5)))


class Tile
    constructor: (x, y) ->
        @material = new THREE.MeshBasicMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )
        @mesh = new THREE.Mesh( hexGeometry, @material )
        @mesh.position.x = x
        @mesh.position.y = y
        @uuid = @mesh.uuid
        @state = "none"
        @team = null

    setState: (newState) ->
        if newState is @state
            return
        switch newState
            when "outofrange"
                @material.color.set Colors.outofrangeTile
            when "onPath"
                @material.color.set Colors.pathTile
            when "highlight"
                @material.color.set Colors.highlightTile

        @state = newState

    clearState: ->
        if @state is "none" and not @_captured
            return

        @state = "none"
        if not @team?
            @material.color.set Colors.baseTile
        else if @team is 0
            @material.color.set Colors.purple
        else if @team is 1
            @material.color.set Colors.red
        @_captured = false

    capture: (@team) ->
        @_captured = true

class TileManager
    constructor: (maxI,maxJ) ->

        @_uuidToHex = new Map()
        @_hexToUuid = new Map()
        @_uuidToTile = new Map()

        # add base tiles to render
        for hexX in [0...maxI]
            height = if hexX%2 is 0 then maxJ else maxJ-1
            for hexY in [0...height]
                {x, y} = hexTo3d [hexX, hexY]
                tile = new Tile x, y

                hexagons.add tile.mesh
                @_uuidToHex.set tile.uuid, [hexX, hexY]
                @_uuidToTile.set tile.uuid, tile
                @_hexToUuid.set String([hexX, hexY]), tile.uuid
        scene.add hexagons

    intersectedHex: (raycaster) ->
        intersects = raycaster.intersectObjects(hexagons.children)
        if intersects.length > 0
            hexUuid = intersects[0].object.uuid
            intersectedHex = @_uuidToHex.get hexUuid
        else
            null

    setStates: (hexStates) ->
        for c in hexagons.children
            tile = @_uuidToTile.get c.uuid
            tile.clearState()
        for state, hexes of hexStates
            for h in hexes
                uuid = @_hexToUuid.get String(h)
                tile = @_uuidToTile.get uuid
                tile.setState state
        return

    getHexes: ->
        hexes = []
        @_uuidToHex.forEach (h, uuid) -> hexes.push h
        hexes

    _fromHex: (hex) ->
        uuid = @_hexToUuid.get String(hex)
        @_uuidToTile.get uuid

    capture: (hex, team) ->
        tile = @_fromHex hex
        tile.capture team

tileManager = new TileManager 13,7



class Barrier
    constructor: (player)->
        @coneHeight = 80
        @player = player
        @geometry = new THREE.CylinderGeometry(30, 30, @coneHeight, 30)
        @material = new THREE.MeshBasicMaterial( { color: "#2c3e50" } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y
        scene.add @mesh



class Player
    constructor: ->
        @coneHeight = 80
        @geometry = new THREE.CylinderGeometry(10, 30, @coneHeight, 4)
        @material = new THREE.MeshBasicMaterial( { color: Colors.white } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]
        @path = []

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setTeam: (team) ->
        @team = team
        if team is 0
            @material = new THREE.MeshBasicMaterial( { color: Colors.darkPurple } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: Colors.selected } )
        else if team is 1
            @material = new THREE.MeshBasicMaterial( { color: Colors.darkRed } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: Colors.selected } )

        @mesh.material = @material

    setState: (@state) ->
        switch @state
            when "selected"
                @mesh.material = @selectedMaterial
            when "none"
                @mesh.material = @material

    moveOnPath: (_basePath) ->
        basePath = _.clone _basePath
        path = []
        start = basePath.shift()
        path.push start
        while end = basePath.shift()
            max = 15
            for i in [1..max]
                newX = start[0]*(1-(i/max)) + end[0]*(i/max)
                newY = start[1]*(1-(i/max)) + end[1]*(i/max)
                iHex = [newX, newY]
                path.push iHex
            path.push end
            path.push end
            start = end
        @path = path



    update: ->
        if @state is "selected"
            @mesh.rotation.y += Math.PI/60

        if @path.length > 0
            newHex = @path.shift()
            @setPosition newHex


class GameView
    constructor: ->
        @movesPerTurn = 4
        @actionPointsPerTurn = 2
        @players = []
        @selectedPlayer = null
        @currentTeamTurn = 0
        @turn = 1
        @movesRemaining = @movesPerTurn
        @actionPointsRemaining = @actionPointsPerTurn

    nextTurn: ->
        if @currentTeamTurn is 0
            @currentTeamTurn = 1
        else
            @currentTeamTurn = 0
        @turn++
        @movesRemaining = @movesPerTurn
        @actionPointsRemaining = @actionPointsPerTurn
        renderUI(this)

    getTeamName: ->
        return TEAM_NAMES[@currentTeamTurn]

    newPlayer: (hex, team) ->
        p = new Player()
        p.setTeam team
        p.setPosition hex
        @players.push p
        scene.add p.mesh

    update: ->
        for p in @players
            p.update()

        # calculate implicit territory control
        # players have 32/16/8/4/2/1 influence
        # naive brute force approach - for each tile, lookup distance of each player

        #influence to capture
        minInfluence = 16

        # required influence advantage over enemy
        diffInfluence = 6

        lastInfluence = @totalInfluence
        @totalInfluence = [0, 0, 0]

        for h in tileManager.getHexes()
            influence = [0,0]
            for p in @players
                playerHex = [Math.round(p.hex[0]), Math.round(p.hex[1])]
                distance = Hex.distance playerHex, h
                influence[p.team] += Math.pow 2, (5-distance)

            if influence[0] >= (influence[1]+diffInfluence) and influence[0] >= minInfluence
                tileManager.capture h, 0
                @totalInfluence[0] += 1
            else if influence[1] >= (influence[0]+diffInfluence) and influence[1] >= minInfluence
                tileManager.capture h, 1
                @totalInfluence[1] += 1
            else
                tileManager.capture h, null
                @totalInfluence[2] += 1


        if not _.isEqual lastInfluence, @totalInfluence
            if renderUI?
                renderUI(this)

    availableHexes: ->
        hexes = new Set()
        for h in tileManager.getHexes()
            hexes.add String(h)
        for p in @players
            hexes.delete String(p.hex)
        hexes.add String(@selectedPlayer.hex)
        hexes

    selectHex: (selectedHex) ->
        if not @selectedPlayer?
            for player, i in @players
                if _.isEqual selectedHex, player.hex
                    if @currentTeamTurn is player.team
                        player.setState "selected"
                        @selectedPlayer = player
        else
            path = Hex.shortestPath @selectedPlayer.hex, selectedHex, @availableHexes()
            if path? and (path.length-1) <= @movesRemaining
                @selectedPlayer.moveOnPath path
                @selectedPlayer.setState "none"
                @selectedPlayer = null
                @movesRemaining -= (path.length - 1)
                renderUI(this)

                if @movesRemaining is 0
                    @nextTurn()

    deselect: ->
        if @selectedPlayer?
            @selectedPlayer.setState "none"
            @selectedPlayer = null


gameView = new GameView()
gameView.newPlayer [0,1], 0
gameView.newPlayer [0,3], 0
gameView.newPlayer [0,5], 0
gameView.newPlayer [12,1], 1
gameView.newPlayer [12,3], 1
gameView.newPlayer [12,5], 1

renderer.setClearColor 0x333333, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("webgl_container").appendChild(renderer.domElement)

raycaster = new THREE.Raycaster()
mouseVector = new THREE.Vector3()
mouseVector.x = 0
mouseVector.y = 0


class Skill
    @cost = 0
    constructor: ->
        console.log("load")

    cast: ->


class SkillBarrier extends Skill
    @cost = 1
    constructor: ->
        super()

    cast: (hex)->
        super()
        barrier = new Barrier()
        barrier.setPosition(hex)



castSkill = (hex, skill) ->
    skill.cast(hex)


onClick = (e) ->
    raycaster.setFromCamera( mouseVector, camera )

    clickedHex = tileManager.intersectedHex raycaster
    if clickedHex?
        gameView.selectHex clickedHex
    else
        gameView.deselect()


onMouseMove = (e) ->
    mouseVector.x = 2 * (e.clientX / window.innerWidth) - 1
    mouseVector.y = 1 - 2 * ( e.clientY / window.innerHeight )


canCast = (skill) ->
    if gameView.actionPointsRemaining >= SkillBarrier.cost
        return true
    else
        return false

onKeyPress = (e) ->
    console.log("KEY: ", e.keyCode)

    if e.keyCode == 98 #B
        if canCast(SkillBarrier)
            raycaster.setFromCamera( mouseVector, camera )

            intersects = raycaster.intersectObjects(hexagons.children)
            if intersects.length > 0
                hexUuid = intersects[0].object.uuid
                clickedHex = uuidToHex.get hexUuid
                barrierSkill = new SkillBarrier()
                castSkill(clickedHex, barrierSkill)
                gameView.actionPointsRemaining -= SkillBarrier.cost
                renderUI(gameView)

update = ->
    gameView.update()
    setTimeout update, 20

render = ->
    raycaster.setFromCamera( mouseVector, camera )

    hoveredHex = tileManager.intersectedHex raycaster

    tileStates =
        onPath: []
        outofrange: []
        highlight: []

    if hoveredHex?
        if gameView.selectedPlayer?
            availableHexes = gameView.availableHexes()
            path = Hex.shortestPath gameView.selectedPlayer.hex, hoveredHex, availableHexes
            if path?
                for h, i in path
                    if i < gameView.movesRemaining
                        tileStates.onPath.push h
                    else if i is gameView.movesRemaining
                        # the last tile in the range should highlight
                        # so you know it is max distance...
                        if _.isEqual h, hoveredHex
                            tileStates.highlight.push h
                        else
                            tileStates.onPath.push h
                    else if i > gameView.movesRemaining
                        tileStates.outofrange.push h
            else
                # might be hovering over a player
                # want invalid path to show rather than nothing
                availableHexes.add String(hoveredHex)
                path = Hex.shortestPath gameView.selectedPlayer.hex, hoveredHex, availableHexes
                if path?
                    for h in path
                        tileStates.outofrange.push h

        else
            tileStates.highlight.push hoveredHex


    # call this as at least want to reset states from last render
    tileManager.setStates tileStates

    renderer.render(scene, camera)
    window.requestAnimationFrame render

onResize = ->
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()

window.addEventListener 'resize', onResize, false
window.addEventListener 'mousemove', onMouseMove, false
window.addEventListener 'click', onClick, false
window.addEventListener 'keypress', onKeyPress, false

update()
render()

UI = React.createClass
    render: ->
        <div>
            <PlayerUI gameView={@props.gameView}/>
            <ScoreUI gameView={@props.gameView}/>
        </div>

ScoreUI = React.createClass
    render: ->
        style =
            display: "inline-block"
            textAlign: "center"
            position: "absolute"
            fontFamily: "Open Sans"
            top: 10
            right: 0
            left: 0

        <div style={style} className="noSelect">
            <span style={color:Colors.purple, fontSize: 60, margin: 32}>{@props.gameView.totalInfluence[0]}</span>
            <span style={color:Colors.baseTile, fontSize: 32, margin: 32}>{@props.gameView.totalInfluence[2]}</span>
            <span style={color:Colors.red, fontSize: 60, margin: 32}>{@props.gameView.totalInfluence[1]}</span>
        </div>


PlayerUI = React.createClass
    render: ->
        style =
            width: 220
            height: 160
            backgroundColor: [Colors.purple, Colors.red][@props.gameView.currentTeamTurn]
            borderTopRightRadius: 200
            boxShadow: "4px -4px 12px 12px rgba(0, 0, 0, 0.2)"
            position: "absolute"
            padding: 40
            fontSize: 24
            fontFamily: "Open Sans"
            left: 0
            bottom: 0
            color: Colors.white
        <div style={style} className="noSelect">
            { @props.gameView.getTeamName() } turn<br />
            Turn {@props.gameView.turn} / 60 <br />
            {("O" for x in [0...@props.gameView.movesRemaining]).join(" ")} <br />
            {("X" for x in [0...@props.gameView.actionPointsRemaining]).join(" ")} <br />
            84 s  <br />
            19 tiles
        </div>


renderUI = (gameView) ->
    React.render(
        <UI gameView={gameView}/>
        document.getElementById('ui_container')
    )


renderUI(gameView)

