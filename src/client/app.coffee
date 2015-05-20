_ = require 'lodash'

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

pointLight.position.x = 300
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
    y: (((stalk*2)+(border+2)*2) * hexY) + (if hexX%2 isnt 0 then (stalk)+border else 0)

uuidToHex = new Map()
hexToUuid = new Map()

# add base tiles to render
for hexX in [0..12]
    height = if hexX%2 is 0 then 7 else 6
    for hexY in [0...height]
        {x, y} = hexTo3d [hexX, hexY]
        material = new THREE.MeshPhongMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )
        hexagon = new THREE.Mesh( hexGeometry, material )
        hexagon.position.x = x
        hexagon.position.y = y
        hexagons.add hexagon
        uuidToHex.set hexagon.uuid, [hexX, hexY]
        hexToUuid.set [hexX, hexY], hexagon.uuid

scene.add hexagons

class Player
    constructor: ->
        @coneHeight = 80
        @geometry = new THREE.CylinderGeometry(10, 30, @coneHeight, 4)
        @material = new THREE.MeshPhongMaterial( { color: 0xccff33 } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]

    setPosition: (hex) ->
        @hex = hex
        {@x, @y} = hexTo3d @hex
        @mesh.position.x = @x
        @mesh.position.y = @y

    setState: (@state) ->
        switch @state
            when "selected"
                @material.color.set "#ffcc33"
            when "none"
                @material.color.set "#ccff33"

    update: ->
        if @state is "selected"
            @mesh.rotation.y += Math.PI/60


class GameView
    constructor: ->
        @players = []
        @selectedPlayer = null

    newPlayer: (hex) ->
        p = new Player()
        p.setPosition hex
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
gameView.newPlayer [0,1]
gameView.newPlayer [0,3]
gameView.newPlayer [0,5]

renderer.setClearColor 0xeeeeff, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("container").appendChild(renderer.domElement)

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
    for i in intersects
        intersectUuids.add i.object.uuid

    for c in hexagons.children
        if intersectUuids.has c.uuid
            c.material.color.set "#ff0000"
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

