class Skill
    constructor: ->
        console.log("load")


    cast: ->




class SkillBarrier extends Skill
    constructor: ->
        super()

    cast: (hex)->
        super()
        barrier = new Barrier()







module.exports = Skill
module.exports = SkillBarrier
