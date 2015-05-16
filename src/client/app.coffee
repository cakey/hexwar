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
camera.position.x = 0
camera.position.y = -250
camera.position.z = 300
camera.rotation.x = 0.8
camera.rotation.y = -0.3
camera.rotation.z = -0.3

pointLight = new THREE.PointLight(0xFFFFFF)

pointLight.position.x = 0
pointLight.position.y = -250
pointLight.position.z = 500

scene.add(pointLight)

stalk = 30*Math.tan(Math.PI/3)

CENTER = new THREE.Vector2( 30, stalk )
BOTTOM_LEFT = new THREE.Vector2( 0, 0 )
BOTTOM_RIGHT = new THREE.Vector2( 60, 0 )
TOP_LEFT = new THREE.Vector2( 0, 2*stalk )
TOP_RIGHT = new THREE.Vector2( 60, 2*stalk )
LEFT = new THREE.Vector2( 30-stalk, stalk )
RIGHT = new THREE.Vector2( 30+stalk, stalk )

height = 10

geometry = new PrismGeometry( [ BOTTOM_LEFT, BOTTOM_RIGHT, RIGHT, TOP_RIGHT, TOP_LEFT, LEFT ], height )

hexagons = new THREE.Object3D();

for i in [-1..8]
    for j in [-1..8]
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

lastSet = null

onMouseMove = (e) ->
    mouseVector.x = 2 * (e.clientX / window.innerWidth) - 1
    mouseVector.y = 1 - 2 * ( e.clientY / window.innerHeight )

    raycaster.setFromCamera( mouseVector, camera )

    intersects = raycaster.intersectObjects(hexagons.children)

    for i in intersects
        if lastSet isnt i.object.uuid
            lastSet = i.object.uuid
            if i.object.material.color.getHexString() is "ff0000"
                i.object.material.color.set("#00b2fc")
            else
                i.object.material.color.set("#ff0000")

            renderer.render(scene, camera)


window.addEventListener 'mousemove', onMouseMove, false

renderer.render(scene, camera)

