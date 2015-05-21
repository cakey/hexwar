class Skill
    constructor: ->
        console.log("load")


    cast: ->




class SkillBarrier extends Skill
    constructor: ->
        super()

    cast: (hex)->
        super()



tileHeight = 3

class Barrier
    constructor: (x,y)->
        @coneHeight = 80
        @geometry = new THREE.CylinderGeometry(10, 30, @coneHeight, 4)
        @material = new THREE.MeshBasicMaterial( { color: "#ffffff" } )
        @mesh = new THREE.Mesh( @geometry, @material )
        @mesh.rotation.x = Math.PI/2
        @mesh.position.z = tileHeight + @coneHeight/2
        @setPosition [0,0]



module.exports = Skill
module.exports = SkillBarrier
module.exports = Barrier
