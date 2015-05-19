PrismGeometry = (vertices, height) ->

    Shape = new THREE.Shape()

    Shape.moveTo( vertices[0].x, vertices[0].y )
    for i in [1..vertices.length-1]
        Shape.lineTo( vertices[i].x, vertices[i].y )
    Shape.lineTo( vertices[0].x, vertices[0].y )

    settings = {amount: height, bevelEnabled: false}
    THREE.ExtrudeGeometry.call( this, Shape, settings )

PrismGeometry.prototype = Object.create( THREE.ExtrudeGeometry.prototype )

module.exports = PrismGeometry
