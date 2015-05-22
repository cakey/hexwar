_ = require 'lodash'
React = require 'React'

PrismGeometry = require './PrismGeometry'
Hex = require '../lib/Hex'

Colors =
    purple: "#9b59b6"
    red: "#e74c3c"
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

camera.position.x = 700
camera.position.y = -4 * cameraDistance
camera.position.z = 4 * cameraDistance
camera.rotation.x = Math.PI/4
camera.rotation.y = 0
camera.rotation.z = 0

pointLight = new THREE.PointLight(0xFFFFFF)

pointLight.position.x = 700
pointLight.position.y = -250
pointLight.position.z = 500

scene.add(pointLight)

TEAM_NAMES = ["Purple", "Red"]


halfEdge = 40
stalk = halfEdge*Math.tan(Math.PI/3)

BOTTOM_LEFT = new THREE.Vector2( -halfEdge, -stalk )
BOTTOM_RIGHT = new THREE.Vector2( halfEdge, -stalk )
TOP_LEFT = new THREE.Vector2( -halfEdge, stalk )
TOP_RIGHT = new THREE.Vector2( halfEdge, stalk )
LEFT = new THREE.Vector2( -stalk, 0 )
RIGHT = new THREE.Vector2( +stalk, 0 )

tileHeight = 3

hexGeometry = new PrismGeometry( [ BOTTOM_LEFT, BOTTOM_RIGHT, RIGHT, TOP_RIGHT, TOP_LEFT, LEFT ], tileHeight )

hexagons = new THREE.Object3D();

hexTo3d = ([hexX, hexY]) ->
    border = 4
    x: (halfEdge+stalk+border*2) * hexX
    y: (((stalk*2)+(border*1.5)*2) * hexY) + (if hexX%2 isnt 0 then (stalk)+border else 0)

uuidToHex = new Map()
hexToUuid = new Map()
validHexes = new Set()

# add base tiles to render
for hexX in [0..12]
    height = if hexX%2 is 0 then 7 else 6
    for hexY in [0...height]
        {x, y} = hexTo3d [hexX, hexY]
        material = new THREE.MeshBasicMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )
        hexagon = new THREE.Mesh( hexGeometry, material )
        hexagon.position.x = x
        hexagon.position.y = y
        hexagons.add hexagon
        uuidToHex.set hexagon.uuid, [hexX, hexY]
        hexToUuid.set String([hexX, hexY]), hexagon.uuid
        validHexes.add String([hexX, hexY])

scene.add hexagons

class Player
    constructor: ->
        @coneHeight = 80
        @geometry = new THREE.CylinderGeometry(10, 30, @coneHeight, 4)
        @material = new THREE.MeshBasicMaterial( { color: Colors.white } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setTeam: (team) ->
        @team = team
        if team is 0
            @material = new THREE.MeshBasicMaterial( { color: Colors.purple } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: Colors.selected } )
        else if team is 1
            @material = new THREE.MeshBasicMaterial( { color: Colors.red } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: Colors.selected } )

        @mesh.material = @material

    setState: (@state) ->
        switch @state
            when "selected"
                @mesh.material = @selectedMaterial
            when "none"
                @mesh.material = @material

    update: ->
        if @state is "selected"
            @mesh.rotation.y += Math.PI/60


class GameView
    constructor: ->
        @movesPerTurn = 4
        @players = []
        @selectedPlayer = null
        @currentTeamTurn = 0
        @turn = 1
        @movesRemaining = @movesPerTurn

    nextTurn: ->
        if @currentTeamTurn is 0
            @currentTeamTurn = 1
        else
            @currentTeamTurn = 0
        @turn++
        @movesRemaining = @movesPerTurn
        renderUI(this)

    getTeamName: ->
        return TEAM_NAMES[@currentTeamTurn]

    newPlayer: (hex, team) ->
        p = new Player()
        p.setPosition hex
        p.setTeam team
        @players.push p
        scene.add p.mesh

    update: ->
        for p in @players
            p.update()

    selectHex: (selectedHex) ->
        if not @selectedPlayer?
            for player, i in @players
                if _.isEqual selectedHex, player.hex
                    if @currentTeamTurn is player.team
                        player.setState "selected"
                        @selectedPlayer = player
        else
            path = Hex.shortestPath @selectedPlayer.hex, selectedHex, validHexes
            if (path.length-1) <= @movesRemaining
                @selectedPlayer.setPosition selectedHex
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


onClick = (e) ->
    raycaster.setFromCamera( mouseVector, camera )

    intersects = raycaster.intersectObjects(hexagons.children)
    if intersects.length > 0
        hexUuid = intersects[0].object.uuid
        clickedHex = uuidToHex.get hexUuid
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

    intersects = raycaster.intersectObjects(hexagons.children)
    intersectUuids = new Set()
    pathUuids = new Set()
    outofRangeUuids = new Set()

    for i in intersects
        intersectUuids.add i.object.uuid
        hex = uuidToHex.get i.object.uuid
        if gameView.selectedPlayer?
            for h, i in Hex.shortestPath gameView.selectedPlayer.hex, hex, validHexes
                if i <= gameView.movesRemaining
                    pathUuids.add hexToUuid.get String(h)
                else
                    outofRangeUuids.add hexToUuid.get String(h)
        break

    for c in hexagons.children
        if outofRangeUuids.has c.uuid
            c.material.color.set Colors.outofrangeTile
        else if pathUuids.has c.uuid
            c.material.color.set Colors.pathTile
        else if intersectUuids.has c.uuid
            c.material.color.set Colors.highlightTile
        else
            c.material.color.set Colors.baseTile

    renderer.render(scene, camera)
    window.requestAnimationFrame render

onResize = ->
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()

window.addEventListener 'resize', onResize, false
window.addEventListener 'mousemove', onMouseMove, false
window.addEventListener 'click', onClick, false

update()
render()

PlayerUI = React.createClass
    render: ->
        style =
            width: 220
            height: 140
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
            {@props.gameView.movesRemaining} Movements <br />
            84 s  <br />
            19 tiles
        </div>


renderUI = (gameView) ->
    React.render(
        <PlayerUI gameView={gameView}/>
        document.getElementById('ui_container')
    )


renderUI(gameView)

