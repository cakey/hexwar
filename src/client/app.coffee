_ = require 'lodash'
React = require 'React'

PrismGeometry = require './PrismGeometry'
Hex = require '../lib/Hex'
Cards = require '../lib/Cards'

Colors =
    purple: "#9b59b6"
    darkPurple: "#8e44ad"
    lightPurple: "#E294FF"
    red: "#e74c3c"
    darkRed: "#c0392b"
    lightRed: "#ffBBAA"
    selected: "#bdc3c7"
    white: "#ffffff"
    baseTile: "#00b2fc"
    highlightTile: "#f39c12"
    pathTile: "#2ecc71"
    pointer: "#27ae60"
    outofrangeTile: "grey"
    background: "#333333"
    grey: "#BBBBDD"


WIDTH = window.innerWidth
HEIGHT = window.innerHeight

VIEW_ANGLE = 70
ASPECT = WIDTH/HEIGHT
NEAR = 0.1
FAR = 30000


renderer = new THREE.WebGLRenderer({ antialias: true })

camera = new THREE.PerspectiveCamera(VIEW_ANGLE,ASPECT,NEAR,FAR)

scene = new THREE.Scene()

scene.add camera

cameraDistance = 85

getCameraXYZ = (d) ->
    x: 365
    y: 400 + (-8 * cameraDistance)
    z: 50 + (7 * cameraDistance)

XYZ = getCameraXYZ cameraDistance
camera.position.x = XYZ.x
camera.position.y = XYZ.y
camera.position.z = XYZ.z

camera.rotation.x = Math.PI / 5
camera.rotation.y = 0
camera.rotation.z = 0

pointLight = new THREE.PointLight(0xFFFFFF)

pointLight.position.x = 700
pointLight.position.y = -250
pointLight.position.z = 500

scene.add(pointLight)

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
        @buildings = []

        # add base tiles to render
        for hexX in [0...7]
            height = [4,5,6,7,6,5,4][hexX]#if hexX%2 is 0 then maxJ else maxJ-1
            offset = [2,1,1,0,1,1,2][hexX]
            for hexY in [offset...height+offset]
                {x, y} = hexTo3d [hexX, hexY]
                tile = new Tile x, y

                hexagons.add tile.mesh
                @_uuidToHex.set tile.uuid, [hexX, hexY]
                @_uuidToTile.set tile.uuid, tile
                @_hexToUuid.set String([hexX, hexY]), tile.uuid
        scene.add hexagons

    occupiedHex: (hex) ->
        for b in @buildings
            if _.isEqual b.hex, hex
                return true
        return false

    addBuilding: (hex, name) ->
        buildings =
            "tower": Tower
            "barracks": Barracks
            "pointer": Pointer
        b = new buildings[name]
        b.setPosition hex
        b.setVisible true
        @buildings.push b
        scene.add b.mesh

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

    adjacentToTeam: (hex, team) ->
        if @getTeam(hex) is team
            return true
        adjacents = Hex.getAdjacent hex
        for h in adjacents
            if @getTeam(h) is team
                return true
        return false

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

    getTeam: (hex) ->
        tile = @_fromHex hex
        tile?.team

tileManager = new TileManager 13,7


class Tower
    constructor: (wireframe=false) ->
        @id = "tower"
        @coneHeight = 110
        @geometry = new THREE.CylinderGeometry(5, 15, @coneHeight, 3)
        @material = new THREE.MeshBasicMaterial( { color: Colors.white, wireframe: wireframe } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]
        @setVisible false

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setVisible: (visible) ->
        @mesh.visible = visible

    update: ->

class Pointer
    constructor: (wireframe=false, teamColor) ->
        if not teamColor?
            teamColor = Colors.pointer
        @id = "pointer"
        @coneHeight = 50
        @geometry = new THREE.CylinderGeometry(20, 5, @coneHeight, 6)
        @material = new THREE.MeshBasicMaterial( { color: teamColor, wireframe: wireframe } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight + 20
        @setPosition [0,0]
        @setVisible false

        @max = 50
        @direction = 2
        @current = 0

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setVisible: (visible) ->
        @mesh.visible = visible

    update: ->
        if @current >= @max or @current < 0
            @direction *= -1
        @mesh.position.z += @direction
        @mesh.rotation.y += Math.PI/50
        @current += @direction

class Barracks
    constructor: (wireframe=false) ->
        @id = "barracks"
        @coneHeight = 10
        @geometry = new THREE.CylinderGeometry(30, 30, @coneHeight, 5)
        @material = new THREE.MeshBasicMaterial( { color: Colors.grey, wireframe: wireframe } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]
        @setVisible false

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setVisible: (visible) ->
        @mesh.visible = visible

    update: ->

meshTower = new Tower true
meshBarracks = new Barracks true
meshPointer = new Pointer true
scene.add meshTower.mesh
scene.add meshBarracks.mesh
scene.add meshPointer.mesh


class Player
    constructor: ->
        @coneHeight = 25
        @geometry = new THREE.CylinderGeometry(4, 10, @coneHeight, 15)
        @material = new THREE.MeshBasicMaterial( { color: Colors.white } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]
        @path = []

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        angle = Math.random()*Math.PI*2
        magnitude = (Math.random()*halfEdge*0.5) + 40
        @mesh.position.x = @x + (Math.cos(angle) * magnitude)
        @mesh.position.y = @y + (Math.sin(angle) * magnitude)

    setTeam: (team) ->
        @team = team
        if team is 0
            @material = new THREE.MeshBasicMaterial( { color: Colors.lightPurple } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: Colors.selected } )
        else if team is 1
            @material = new THREE.MeshBasicMaterial( { color: Colors.lightRed } )
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
        @movesPerTurn = 2
        @actionsPerTurn = 1
        @players = []
        @selectedPlayer = null
        @currentTeamTurn = 0
        @turn = 1
        @movesRemaining = @movesPerTurn
        @actionsRemaining = @actionsPerTurn
        @casting = false
        @teamCards = [
            ["Influence","Influence","Barracks", "Barracks", "Attack"],
            ["Influence","Influence","Barracks", "Barracks", "Attack"]
        ]
        @activeCard = null



    nextTurn: ->
        # run actions at end of turn...
        for building in tileManager.buildings
            if tileManager.getTeam(building.hex) is @currentTeamTurn
                if building.id is "barracks"
                    @newPlayer building.hex, @currentTeamTurn

        if @currentTeamTurn is 0
            @currentTeamTurn = 1
        else
            @currentTeamTurn = 0
        @turn++
        @movesRemaining = @movesPerTurn
        @actionsRemaining = @actionsPerTurn
        @activeCard = null
        renderUI(this)


    getActiveCardID: ->
        @teamCards[@currentTeamTurn][@activeCard]

    setActiveCard: (cardID) ->
        @activeCard = cardID
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

        for b in tileManager.buildings
            b.update()

        lastInfluence = @totalInfluence
        @totalInfluence = [0, 0, 0]

        ###
            # calculate implicit territory control
            # players have 32/16/8/4/2/1 influence
            # naive brute force approach - for each tile, lookup distance of each player

            #influence to capture
            minInfluence = 16

            # required influence advantage over enemy
            diffInfluence = 5


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
        ###


        for h in tileManager.getHexes()
            if tileManager.getTeam(h) is 0
                @totalInfluence[0] += 1
            else if tileManager.getTeam(h) is 1
                @totalInfluence[1] += 1
            else
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
        if @selectedPlayer?
            hexes.add String(@selectedPlayer.hex)
        hexes

    cast: (cardID, hex, team, restrict=true) ->
        if Cards[cardID]?
            if not restrict or Cards[cardID].allowed(tileManager, hex, team)
                states = Cards[cardID].newStates(tileManager, hex, @availableHexes())
                for h in states.captured
                    tileManager.capture h, team
                building = {
                    Influence:"tower",
                    Barracks: "barracks"
                    Attack: "pointer"
                }[cardID]
                tileManager.addBuilding hex, building
                return true
        return false

    selectHex: (selectedHex) ->
        if @activeCard?
            # play the card
            if @cast @getActiveCardID(), selectedHex, @currentTeamTurn
                @teamCards[@currentTeamTurn].splice @activeCard, 1
                @nextTurn()

        else
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

gameView.cast "Influence", [1,3], 0, false
gameView.cast "Influence", [5,3], 1, false

renderer.setClearColor 0x333333, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("webgl_container").appendChild(renderer.domElement)

raycaster = new THREE.Raycaster()
mouseVector = new THREE.Vector3()
mouseVector.x = 0
mouseVector.y = 0

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

    meshTower.setVisible false
    meshBarracks.setVisible false
    meshPointer.setVisible false
    if hoveredHex?
        availableHexes = gameView.availableHexes()
        if gameView.activeCard isnt null
            cardID = gameView.getActiveCardID()
            if Cards[cardID].allowed(tileManager, hoveredHex, gameView.currentTeamTurn)
                states = Cards[cardID].newStates(tileManager, hoveredHex, availableHexes)
                for h in states.captured
                    tileStates.onPath.push h
                building = {
                    Influence: meshTower,
                    Barracks: meshBarracks
                    Attack: meshPointer
                }[cardID]
                if building?
                    building.setPosition hoveredHex
                    building.setVisible true
                else
                    tileStates.onPath.push hoveredHex
            else
                tileStates.outofrange.push hoveredHex

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

onWheel = (e) ->
    cameraDistance *= if e.deltaY < 0 then 1.05 else 0.95
    XYZ = getCameraXYZ cameraDistance
    camera.position.x = XYZ.x
    camera.position.y = XYZ.y
    camera.position.z = XYZ.z

onKeyPress = (e) ->
    if not gameView.selectedPlayer and gameView.actionsRemaining > 0 and not gameView.casting
        if e.keyCode is 98 #B
            gameView.casting = true


window.addEventListener 'resize', onResize, false
window.addEventListener 'mousemove', onMouseMove, false
window.addEventListener 'click', onClick, false
window.addEventListener 'wheel', onWheel, false
window.addEventListener 'keypress', onKeyPress, false

update()
render()

UI = React.createClass
    render: ->
        <div>
            <CardsUI gameView={@props.gameView}/>
            <PlayerUI gameView={@props.gameView}/>
            <ScoreUI gameView={@props.gameView}/>
        </div>

CardsUI = React.createClass

    select: (cardID) ->
        @props.gameView.setActiveCard cardID

    render: ->

        containerStyle =
            display: "inline-block"
            textAlign: "center"
            position: "absolute"
            fontFamily: "Open Sans"
            bottom: 0
            right: 0
            padding: 15
            fontSize: 24

        <div style={containerStyle}>
            {
                for cardID, i in @props.gameView.teamCards[@props.gameView.currentTeamTurn]
                    <Card cardID={cardID} cardNo={i} key={i} active={i is @props.gameView.activeCard} select={@select}/>
            }
        </div>

Card = React.createClass
    getInitialState: ->
        hover: false
    mouseOver: ->
        @setState
            hover: true
    mouseOut: ->
        @setState
            hover: false
    mouseUp: ->
        @props.select @props.cardNo

    render: ->
        cardStyle =
            display: "inline-block"
            textAlign: "center"
            float: "right"
            fontFamily: "Open Sans"
            width: 100
            height: 200
            margin: 15
            backgroundColor: Colors.baseTile
            color:Colors.background
            fontSize: 18
            padding: 32
            boxShadow: "0px 0px 8px 8px #{if @props.active or @state.hover then 'rgba(46, 204, 113, 0.4)' else 'rgba(0, 0, 0, 0.2)'}"
            borderRadius: 20



        <div style={cardStyle} onMouseOver=@mouseOver onMouseOut=@mouseOut onMouseUp=@mouseUp>
            {Cards[@props.cardID].description}
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
            width: 180
            height: 100
            backgroundColor: [Colors.purple, Colors.red][@props.gameView.currentTeamTurn]
            borderTopRightRadius: 200
            boxShadow: "4px -4px 12px 12px rgba(0, 0, 0, 0.2)"
            position: "absolute"
            padding: 60
            fontSize: 24
            fontFamily: "Open Sans"
            left: 0
            bottom: 0
            color: Colors.white
        <div style={style} className="noSelect">
            { @props.gameView.getTeamName() } turn<br />
            Turn {@props.gameView.turn} / 60 <br />
        </div>


renderUI = (gameView) ->
    React.render(
        <UI gameView={gameView}/>
        document.getElementById('ui_container')
    )


renderUI(gameView)

