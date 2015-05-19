WIDTH = window.innerWidth
HEIGHT = window.innerHeight

VIEW_ANGLE = 70
ASPECT = WIDTH/HEIGHT
NEAR = 0.1
FAR = 10000

PrismGeometry = require './PrismGeometry'

renderer = new THREE.WebGLRenderer({ antialias: true })

camera = new THREE.PerspectiveCamera(VIEW_ANGLE,ASPECT,NEAR,FAR)

scene = new THREE.Scene()

scene.add camera

cameraDistance = 185

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

hexTo3d = (hexX, hexY) ->
    border = 4
    x: (halfEdge+stalk+border*2) * hexX
    y: (((stalk*2)+(border+2)*2) * hexY) + (if hexX%2 isnt 0 then (stalk)+border else 0)

uuidToHex = new Map()
hexToUuid = new Map()

# add base tiles to render
for hexX in [0..12]
    height = if hexX%2 is 0 then 7 else 6
    for hexY in [0...height]
        {x, y} = hexTo3d hexX, hexY
        material = new THREE.MeshPhongMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )
        hexagon = new THREE.Mesh( hexGeometry, material )
        hexagon.position.x = x
        hexagon.position.y = y
        hexagons.add hexagon
        uuidToHex.set hexagon.uuid, [hexX, hexY]
        hexToUuid.set [hexX, hexY], hexagon.uuid

scene.add hexagons

# add player to render
coneHeight = 80

playerGeometry = new THREE.CylinderGeometry(10, 30, coneHeight, 100)
playerMaterial = new THREE.MeshPhongMaterial( { color: 0xccff33 } )
playerMesh = new THREE.Mesh( playerGeometry, playerMaterial )
{x, y} = hexTo3d 5, 1
playerMesh.rotation.x = Math.PI/2
playerMesh.position.x = x
playerMesh.position.y = y
playerMesh.position.z = tileHeight + coneHeight/2
scene.add playerMesh

renderer.setClearColor 0xeeeeff, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("container").appendChild(renderer.domElement)

raycaster = new THREE.Raycaster()
mouseVector = new THREE.Vector3()
mouseVector.x = 0
mouseVector.y = 0

lastSet = null

onClick = (e) ->
    raycaster.setFromCamera( mouseVector, camera )

    intersects = raycaster.intersectObjects(hexagons.children)
    console.log intersects
    if intersects.length > 0
        playerMesh.position.x = intersects[0].object.position.x
        playerMesh.position.y = intersects[0].object.position.y

onMouseMove = (e) ->
    mouseVector.x = 2 * (e.clientX / window.innerWidth) - 1
    mouseVector.y = 1 - 2 * ( e.clientY / window.innerHeight )


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


window.addEventListener 'mousemove', onMouseMove, false
window.addEventListener 'click', onClick, false

render()

