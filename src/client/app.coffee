_ = require 'lodash'
React = require 'React'

PrismGeometry = require './PrismGeometry'


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

scene.add hexagons

getAdjacentHexes = ([x, y]) ->
    return (
        if x%2 is 0
            [[x-1, y-1],[x-1, y],[x, y-1],[x, y+1],[x+1, y-1],[x+1, y]]
        else
            [[x-1, y],[x-1, y+1],[x, y-1],[x, y+1],[x+1, y],[x+1, y+1]]
    )



class Player
    constructor: ->
        @coneHeight = 80
        @geometry = new THREE.CylinderGeometry(10, 30, @coneHeight, 4)
        @material = new THREE.MeshBasicMaterial( { color: "#9b59b6" } )
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
        if team == 1
            @material = new THREE.MeshBasicMaterial( { color: "#9b59b6" } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: "#8e44ad" } )
        else if team == 2
            @material = new THREE.MeshBasicMaterial( { color: "#e74c3c" } )
            @selectedMaterial = new THREE.MeshBasicMaterial( { color: "#c0392b" } )

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
        @players = []
        @selectedPlayer = null

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
                    player.setState "selected"
                    @selectedPlayer = player
        else
            @selectedPlayer.setPosition selectedHex
            @selectedPlayer.setState "none"
            @selectedPlayer = null

    deselect: ->
        if @selectedPlayer?
            @selectedPlayer.setState "none"
            @selectedPlayer = null

gameView = new GameView()
gameView.newPlayer [0,1], 1
gameView.newPlayer [0,3], 1
gameView.newPlayer [0,5], 1
gameView.newPlayer [12,1], 2
gameView.newPlayer [12,3], 2
gameView.newPlayer [12,5], 2

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
    adjacentUuids = new Set()

    for i in intersects
        intersectUuids.add i.object.uuid
        hex = uuidToHex.get i.object.uuid
        for h in getAdjacentHexes hex
            adjacentUuids.add hexToUuid.get String(h)
        break

    for c in hexagons.children
        if intersectUuids.has c.uuid
            c.material.color.set "#f39c12"
        else if adjacentUuids.has c.uuid
            c.material.color.set "#2ecc71"
        else
            c.material.color.set "#00b2fc"

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
            backgroundColor: "rgba(245, 245, 255, 0.9)"
            borderTopRightRadius: 200
            boxShadow: "4px -4px 12px 12px rgba(0, 0, 0, 0.2)"
            position: "absolute"
            padding: 40
            fontSize: 24
            fontFamily: "Open Sans"
            left: 0
            bottom: 0
            color: "#555555"
        <div style={style} className="noSelect">
            Your turn. <br />
            Turn 34 / 60 <br />
            1 Action | 0 Move <br />
            84 s  <br />
            19 tiles
        </div>

React.render(
    <PlayerUI />
    document.getElementById('ui_container')
)

    # React.render(
    #     <Arena gameState={gameState} canvas={canvas} camera={camera} UIPlayer={focusedUIPlayer} />
    #     document.getElementById('arena')
    # )
