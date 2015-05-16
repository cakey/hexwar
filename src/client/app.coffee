WIDTH = 800
HEIGHT = 600

VIEW_ANGLE = 45
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
camera.position.x = -100
camera.position.y = -200
camera.position.z = 300
camera.rotation.x = 0.7
camera.rotation.y = -0.3

material = new THREE.MeshPhongMaterial( { color: 0x00b2fc, specular: 0x00ffff, shininess: 10 } )

pointLight = new THREE.PointLight(0xFFFFFF)

pointLight.position.x = -100
pointLight.position.y = -200
pointLight.position.z = 300

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
hexagon = new THREE.Mesh( geometry, material )
scene.add( hexagon )

renderer.setClearColor 0xddccff, 1
renderer.setSize WIDTH, HEIGHT

document.getElementById("container").appendChild(renderer.domElement)

renderer.render(scene, camera)
