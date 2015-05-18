WIDTH = window.innerWidth
HEIGHT = window.innerHeight

VIEW_ANGLE = 70
ASPECT = WIDTH/HEIGHT
NEAR = 0.1
FAR = 10000

PrismGeometry = (vertices, height) ->

    Shape = new THREE.Shape()

    f = (ctx) ->

        ctx.moveTo( vertices[0].x, vertices[0].y )

        for i in [1..vertices.length-1]
            ctx.lineTo( vertices[i].x, vertices[i].y )

        ctx.lineTo( vertices[0].x, vertices[0].y )

    f Shape

    settings = {amount: height, bevelEnabled: false}

    THREE.ExtrudeGeometry.call( this, Shape, settings )

PrismGeometry.prototype = Object.create( THREE.ExtrudeGeometry.prototype );

renderer = new THREE.WebGLRenderer()

camera = new THREE.PerspectiveCamera(VIEW_ANGLE,ASPECT,NEAR,FAR)

scene = new THREE.Scene()

scene.add camera

cameraDistance = 165

camera.position.x = 530
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

stalk = 30*Math.tan(Math.PI/3)

CENTER = new THREE.Vector2( 30, stalk )

BOTTOM_LEFT = new THREE.Vector2( -30, -stalk )
BOTTOM_RIGHT = new THREE.Vector2( 30, -stalk )
TOP_LEFT = new THREE.Vector2( -30, stalk )
TOP_RIGHT = new THREE.Vector2( 30, stalk )
LEFT = new THREE.Vector2( -stalk, 0 )
RIGHT = new THREE.Vector2( +stalk, 0 )

height = 10

geometry = new PrismGeometry( [ BOTTOM_LEFT, BOTTOM_RIGHT, RIGHT, TOP_RIGHT, TOP_LEFT, LEFT ], height )

hexagons = new THREE.Object3D();

for j in [0..12]
    height = if j%2 is 0 then 7 else 6
    for i in [0...height]
        material = new THREE.MeshPhongMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )
        hexagon = new THREE.Mesh( geometry, material )
        hexagon.position.x = (30+stalk+6) * j
        y = ((stalk*2)+6) * i
        if j%2 isnt 0
            y += (stalk)+3
        hexagon.position.y = y
        hexagons.add hexagon

scene.add hexagons

renderer.setClearColor 0xeeeeff, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("container").appendChild(renderer.domElement)

raycaster = new THREE.Raycaster()
mouseVector = new THREE.Vector3()
mouseVector.x = 0
mouseVector.y = 0

lastSet = null

onMouseMove = (e) ->
    mouseVector.x = 2 * (e.clientX / window.innerWidth) - 1
    mouseVector.y = 1 - 2 * ( e.clientY / window.innerHeight )


render = ->
    raycaster.setFromCamera( mouseVector, camera )

    intersects = raycaster.intersectObjects(hexagons.children)
    if intersects.length < 5
        for i in intersects
            # i.object.rotation.x += 0.1
            # i.object.rotation.y += 0.1
            # i.object.rotation.z += 0.1
            if lastSet isnt i.object.uuid
                lastSet = i.object.uuid
                if i.object.material.color.getHexString() is "ff0000"
                    i.object.material.color.set("#00b2fc")
                else
                    i.object.material.color.set("#ff0000")

    renderer.render(scene, camera)
    window.requestAnimationFrame render


window.addEventListener 'mousemove', onMouseMove, false

render()

