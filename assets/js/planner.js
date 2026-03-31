/* =====================================================
   Kingshot Hive Planner
   -----------------------------------------------------
   Main script controlling:

   - Grid system
   - Drag & drop
   - Castle / banner creation
   - Trap positioning
   - Layout save / load
   - JSON export / import
===================================================== */

/* =========================================================
   CONFIGURATION
   ---------------------------------------------------------
   Base settings of the planner:
   grid size, object sizes and map dimensions
========================================================= */

const grid = 40
const castleSize = 2
const trapSize = 3

let mapTilesX = 40
let mapTilesY = 25
let centerTile = mapTilesX / 2
let startTile = centerTile - Math.floor(trapSize / 2)

/* =========================================================
   GLOBAL STATE
   ---------------------------------------------------------
   Runtime variables used by the planner
========================================================= */

/* DOM REFERENCES */
let map = document.getElementById("map")

const castleDialog = document.getElementById("castleDialog")
const castleForm = document.getElementById("castleForm")
const castleAddBtn = document.getElementById("castleAddBtn")
const castleDialogTitle = document.getElementById("castleDialogTitle")

const deleteDialog = document.getElementById("deleteDialog")
const deleteConfirm = document.getElementById("deleteConfirm")
const deleteCancel = document.getElementById("deleteCancel")

/* DIALOG STATE */
let editTarget = null
let deleteTarget = null
let posDialogTarget = null

/* DRAG STATE */
let selected = null
let offsetX = 0
let offsetY = 0
let hasDragged = false

/* SELECTION STATE */
let activeObject = null

/* OBJECT STATE */
let id = 1
let spawnOffset = 0

/* VIEW STATE */
let zoom = 1

/* ORIGIN */
let originX = 0
let originY = 0

/* =========================================================
   MAP OBJECT REFERENCES
   ---------------------------------------------------------
   References to static elements already in the map
========================================================= */

let trap1 = document.getElementById("trap1")
let trap2 = document.getElementById("trap2")

makeDraggable(trap1)
makeDraggable(trap2)

/* =========================================================
   TRAP POSITIONING
   ---------------------------------------------------------
   Positions traps centered on their grid tiles
========================================================= */

function trapOffset(){
    return (grid * trapSize - trap1.offsetWidth) / 2
}

function applyMapDimensions(){
    map.style.width  = mapTilesX * grid + "px"
    map.style.height = mapTilesY * grid + "px"
}

function buildAxes(){

    const tilesX = Math.round(map.offsetWidth  / grid)
    const tilesY = Math.round(map.offsetHeight / grid)

    const axisX = document.getElementById("axisX")
    const axisY = document.getElementById("axisY")

    axisX.innerHTML = ""
    axisY.innerHTML = ""

    for(let i = 0; i < tilesX; i++){
        const d = document.createElement("div")
        d.textContent = originX + i
        axisX.appendChild(d)
    }

    for(let i = tilesY - 1; i >= 0; i--){
        const d = document.createElement("div")
        d.textContent = originY + i
        axisY.appendChild(d)
    }

}

function positionTraps(){

    let offset = trapOffset()

    trap1.style.left = startTile * grid + offset + "px"
    trap1.style.top  = startTile * grid + offset + "px"

    trap2.style.left = (startTile + 6) * grid + offset + "px"
    trap2.style.top  = startTile * grid + offset + "px"

}

/* =========================================================
   ORIGIN
========================================================= */

function updateOriginLabel(){
    document.getElementById("originLabel").textContent = `Origin: (${originX}, ${originY})`
}

function openOriginDialog(){
    document.getElementById("originX").value = originX
    document.getElementById("originY").value = originY
    document.getElementById("mapWidth").value = mapTilesX
    document.getElementById("mapHeight").value = mapTilesY
    document.getElementById("originDialog").showModal()
}

function saveMapSettings(){
    originX   = parseInt(document.getElementById("originX").value)  || 0
    originY   = parseInt(document.getElementById("originY").value)  || 0
    mapTilesX = parseInt(document.getElementById("mapWidth").value) || mapTilesX
    mapTilesY = parseInt(document.getElementById("mapHeight").value)|| mapTilesY
    applyMapDimensions()
    saveLayout()
    updateOriginLabel()
    buildAxes()
    document.getElementById("originDialog").close()
}

// keep backward-compat alias used by cancel button wiring
function saveOrigin(){ saveMapSettings() }

document.getElementById("originCancelBtn").addEventListener("click", function(){
    document.getElementById("originDialog").close()
})

document.getElementById("posCancelBtn").addEventListener("click", function(){
    document.getElementById("posDialog").close()
})

function savePosDialog(){
    let logicalX = parseInt(document.getElementById("posX").value) - originX
    let logicalY = parseInt(document.getElementById("posY").value) - originY
    applyLogicalPosition(posDialogTarget, logicalX, logicalY)
    if(posDialogTarget === activeObject) highlightAxesForElement(posDialogTarget)
    posDialogTarget = null
    document.getElementById("posDialog").close()
}

window.addEventListener("load", function(){
    applyMapDimensions()
    buildAxes()
    positionTraps()
})

map.addEventListener("click", (e)=>{
    if(e.target === map) clearSelection()
})

/* =========================================================
   SELECTION
========================================================= */

function clearAxisHighlights(){
    document.querySelectorAll("#axisX .axis-highlight, #axisY .axis-highlight")
        .forEach(d => d.classList.remove("axis-highlight"))
}

function highlightAxesForElement(el){
    let size = el.classList.contains("trap") || el.classList.contains("plainshq") ? trapSize :
               el.classList.contains("castle") ? castleSize : 1
    let offset = (grid * size - el.offsetWidth) / 2
    let tileX = Math.round((parseFloat(el.style.left) - offset) / grid)
    let tileY = Math.round((parseFloat(el.style.top)  - offset) / grid)

    clearAxisHighlights()
    const axisX = document.getElementById("axisX")
    const axisY = document.getElementById("axisY")
    // X: logical bottom-left X = tileX (left-to-right, unchanged)
    if(axisX.children[tileX]) axisX.children[tileX].classList.add("axis-highlight")
    // Y: logical bottom-left Y = mapTilesY - tileY - size, which sits at axis child index tileY + size - 1
    const axisYIndex = tileY + size - 1
    if(axisY.children[axisYIndex]) axisY.children[axisYIndex].classList.add("axis-highlight")
}

function clearSelection(){
    document.querySelectorAll(".castle, .banner, .trap, .plainshq").forEach(o => o.classList.remove("active"))
    document.querySelectorAll(".player").forEach(p => p.classList.remove("active"))
    clearAxisHighlights()
    activeObject = null
}

function selectMapObject(el){
    const wasActive = el.classList.contains("active")
    clearSelection()
    if(wasActive) return
    activeObject = el
    el.classList.add("active")
    if(el.classList.contains("castle")){
        document.querySelectorAll(".player").forEach(p => {
            const nameEl = p.querySelector(".player-name")
            if(nameEl && nameEl.textContent === el.dataset.name) p.classList.add("active")
        })
    }
    highlightAxesForElement(el)
}

/* =========================================================
   OBJECT CREATION
   ---------------------------------------------------------
   Functions responsible for creating map objects
   (castles and banners)
========================================================= */

function isTileOccupied(tileX, tileY, size){

    const objects = document.querySelectorAll(".castle, .banner, .trap, .plainshq")

    let mapRect = map.getBoundingClientRect()

    for(const obj of objects){

        let rect = obj.getBoundingClientRect()

        let x = rect.left - mapRect.left
        let y = rect.top  - mapRect.top

        let objSize =
            obj.classList.contains("trap") || obj.classList.contains("plainshq") ? trapSize :
                obj.classList.contains("castle") ? castleSize :
                    1

        let objTileX = Math.round(x / grid)
        let objTileY = Math.round(y / grid)

        if(
            tileX < objTileX + objSize &&
            tileX + size > objTileX &&
            tileY < objTileY + objSize &&
            tileY + size > objTileY
        ){
            return true
        }
    }

    return false
}
function findFreeTile(size){

    for(let y = 0; y < mapTilesY; y++){
        for(let x = 0; x < mapTilesX; x++){

            if(!isTileOccupied(x, y, size)){
                return {x, y}
            }

        }
    }

    return {x:0, y:0}
}
function createCastle(x=0,y=0,name="",power="0M", trap="F", skipList=false){

    // if requested position is occupied, find a free tile
    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, castleSize)){
        let free = findFreeTile(castleSize)
        tileX = free.x
        tileY = free.y
    }

    x = tileX * grid
    y = tileY * grid

    let c=document.createElement("div")
    c.dataset.power = power
    c.dataset.trap = trap      // ⭐ trap opslaan
    c.className="castle"

    if(!name) name="Castle "+id

    c.innerHTML=`
<div class="castle-name">${name}</div>
<div class="castle-trap"></div>
<div class="castle-power">${power}</div>
`

    c.dataset.name=name
    c.dataset.id=id

    map.appendChild(c)

    let offset=(grid*castleSize-c.offsetWidth)/2

    c.style.left=x+offset+"px"
    c.style.top=y+offset+"px"

    makeDraggable(c)

    id++

    if(!skipList){
        updatePlayerList()
        applyCastleLevels()
    }
}

function createBanner(x = 0, y = 0){

    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, 1)){
        let free = findFreeTile(1)
        tileX = free.x
        tileY = free.y
    }

    x = tileX * grid
    y = tileY * grid

    let b = document.createElement("div")
    b.className = "banner"

    map.appendChild(b)

    let offset = (grid - b.offsetWidth) / 2

    b.style.left = x + offset + "px"
    b.style.top  = y + offset + "px"

    makeDraggable(b)
}

function createPlainsHQ(x=0,y=0){

    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, trapSize)){
        let free = findFreeTile(trapSize)
        tileX = free.x
        tileY = free.y
    }

    x = tileX * grid
    y = tileY * grid

    let hq = document.createElement("div")
    hq.className = "plainshq"

    hq.innerHTML = `<div class="hq-label">Plains HQ</div>`

    map.appendChild(hq)

    let offset = (grid*trapSize - hq.offsetWidth)/2

    hq.style.left = x + offset + "px"
    hq.style.top  = y + offset + "px"

    makeDraggable(hq)
}

/* =========================================================
   COORDINATE HELPERS
========================================================= */

function getLogicalCoords(el){
    let size = el.classList.contains("trap") || el.classList.contains("plainshq") ? trapSize :
               el.classList.contains("castle") ? castleSize : 1
    let offset = (grid * size - el.offsetWidth) / 2
    let tileX = Math.round((parseFloat(el.style.left) - offset) / grid)
    let tileY = Math.round((parseFloat(el.style.top)  - offset) / grid)
    return { x: tileX, y: mapTilesY - tileY - size }
}

function applyLogicalPosition(el, logicalX, logicalY){
    let size = el.classList.contains("trap") || el.classList.contains("plainshq") ? trapSize :
               el.classList.contains("castle") ? castleSize : 1
    let offset = (grid * size - el.offsetWidth) / 2
    el.style.left = logicalX * grid + offset + "px"
    el.style.top  = (mapTilesY - logicalY - size) * grid + offset + "px"
}

/* =========================================================
   UI ACTIONS
   ---------------------------------------------------------
   Functions triggered by UI buttons
========================================================= */

function addCastle(){

    editTarget = null
    castleForm.reset()

    castleDialogTitle.textContent = "New castle"
    castleAddBtn.textContent = "Add"

    castleDialog.showModal()

}

function addBanner(){

    createBanner(
        200 + spawnOffset * grid,
        200
    )

    spawnOffset++

}

function addPlainsHQ(){

    createPlainsHQ(
        200 + spawnOffset * grid,
        200
    )

    spawnOffset++

}

function setZoom(value, btn){

    zoom = value

    map.style.transform = `scale(${zoom})`
    map.style.transformOrigin = "top left"

    document.querySelectorAll(".zoom-btn").forEach(b=>{
        b.classList.remove("active")
    })

    btn.classList.add("active")
}

function setTrap(t, btn=null){

    document.getElementById("castleTrap").value = t

    document.querySelectorAll(".trap-select button")
        .forEach(b => b.classList.remove("active"))

    if(btn){
        btn.classList.add("active")
    } else {
        document
            .querySelector(`.trap-select button[onclick*="'${t}'"]`)
            ?.classList.add("active")
    }

}

/* =========================================================
   CASTLE DIALOG HANDLING
========================================================= */

// Cancel button
document.getElementById("castleCancelBtn").addEventListener("click", () => {
    castleDialog.classList.remove("edit-mode")
    castleDialog.close()
})

// Add button (form submit)
castleForm.addEventListener("submit", (e) => {

    e.preventDefault()

    let name = document.getElementById("castleName").value
    let power = document.getElementById("castlePower").value || "0M"
    let trap = document.getElementById("castleTrap").value

    if(editTarget){

        editTarget.dataset.name = name
        editTarget.dataset.power = power
        editTarget.dataset.trap = trap

        let newX = parseInt(document.getElementById("castleCoordX").value) - originX
        let newY = parseInt(document.getElementById("castleCoordY").value) - originY
        applyLogicalPosition(editTarget, newX, newY)

        editTarget.innerHTML = `
<div class="castle-name">${name}</div>
<div class="castle-trap"></div>
<div class="castle-power">${power}</div>
`

        updatePlayerList()
        applyCastleLevels()
    }else{

        createCastle(
            spawnOffset * castleSize * grid,
            0,
            name,
            power,
            trap
        )

        spawnOffset++
    }

    castleDialog.close()
    castleDialog.classList.remove("edit-mode")

})

/* =========================================================
   DELETE DIALOG HANDLING
========================================================= */

deleteCancel.addEventListener("click", () => {
    deleteDialog.close()
})

deleteConfirm.addEventListener("click", () => {

    if(deleteTarget){
        deleteTarget.remove()
        updatePlayerList()
    }

    deleteDialog.close()

})

/* =========================================================
   DRAG SYSTEM
   ---------------------------------------------------------
   Handles dragging of objects on the map
========================================================= */

function makeDraggable(el){

    el.addEventListener("mousedown",(e)=>{

        if(e.button !== 0) return

        selected = el
        hasDragged = false

        let rect = el.getBoundingClientRect()

        offsetX = e.clientX - rect.left
        offsetY = e.clientY - rect.top

        selected.classList.add("dragging")
        selected.classList.add("drag-preview")

    })


    el.addEventListener("contextmenu",(e)=>{

        e.preventDefault()

        if(
            el.classList.contains("castle") ||
            el.classList.contains("banner") ||
            el.classList.contains("plainshq")
        ){

            let type =
                el.classList.contains("banner") ? "Banner" :
                    el.classList.contains("plainshq") ? "Plains HQ" :
                        "Castle"

            deleteTarget = el
            document.getElementById("deleteText").textContent = type + " delete?"
            deleteDialog.showModal()

        }

    })


    el.addEventListener("dblclick",()=>{

        if(el.classList.contains("castle")){

            editTarget = el

            document.getElementById("castleName").value = el.dataset.name
            document.getElementById("castlePower").value = el.dataset.power
            setTrap(el.dataset.trap || "F")

            const coords = getLogicalCoords(el)
            document.getElementById("castleCoordX").value = originX + coords.x
            document.getElementById("castleCoordY").value = originY + coords.y

            castleDialogTitle.textContent = "Edit castle"
            castleAddBtn.textContent = "Update"
            castleDialog.classList.add("edit-mode")
            castleDialog.showModal()

        } else {

            let type = el.classList.contains("banner") ? "Banner" :
                       el.classList.contains("plainshq") ? "Plains HQ" : "Trap"

            const coords = getLogicalCoords(el)
            document.getElementById("posDialogTitle").textContent = type + " position"
            document.getElementById("posX").value = originX + coords.x
            document.getElementById("posY").value = originY + coords.y
            posDialogTarget = el
            document.getElementById("posDialog").showModal()

        }

    })

}

/* =========================================================
   DRAG MOVEMENT
========================================================= */

document.addEventListener("mousemove",(e)=>{

    if(!selected) return

    hasDragged = true

    let rect = map.getBoundingClientRect()

    let x = (e.clientX - rect.left - offsetX) / zoom
    let y = (e.clientY - rect.top  - offsetY) / zoom

    selected.style.left = x + "px"
    selected.style.top  = y + "px"

})

/* =========================================================
   GRID SNAP
   ---------------------------------------------------------
   Snap objects to the grid when released
========================================================= */

document.addEventListener("mouseup",()=>{

    if(!selected) return

    let x = parseInt(selected.style.left)
    let y = parseInt(selected.style.top)

    x = Math.round(x/grid)*grid
    y = Math.round(y/grid)*grid

    let size

    if(selected.classList.contains("trap") || selected.classList.contains("plainshq"))
        size = trapSize
    else if(selected.classList.contains("banner"))
        size = 1
    else
        size = castleSize

    let offset = (grid*size - selected.offsetWidth)/2

    selected.style.left = x + offset + "px"
    selected.style.top  = y + offset + "px"

    selected.classList.remove("drag-preview")
    selected.classList.remove("dragging")

    if(!hasDragged){
        selectMapObject(selected)
    } else if(selected === activeObject){
        highlightAxesForElement(selected)
    }

    selected = null

})

/* =========================================================
   PLAYER POWER ANALYSIS
   ---------------------------------------------------------
   Calculates clan average power and player strength level
========================================================= */

function parsePower(p){

    if(!p) return 0

    p = p.toUpperCase().replace("M","")

    return parseFloat(p)
}

function getAveragePower(){

    let powers = []

    document.querySelectorAll(".castle").forEach(c=>{
        powers.push(parsePower(c.dataset.power))
    })

    if(powers.length === 0) return 0

    let sum = powers.reduce((a,b)=>a+b,0)

    return sum / powers.length
}

function getPowerLevel(playerPower, avg){

    if(avg === 0) return ""

    let percent = (playerPower / avg) * 100

    if(percent < 70) return "Poor"
    if(percent < 85) return "Very Low"
    if(percent < 100) return "Low"
    if(percent < 115) return "Medium"
    if(percent < 130) return "High"
    if(percent < 150) return "Very High"

    return "Exceptional"
}

function applyCastleLevels(){

    let avg = getAveragePower()

    document.querySelectorAll(".castle").forEach(c=>{

        let value = parsePower(c.dataset.power)
        let level = getPowerLevel(value, avg)

        // oude level classes verwijderen
        c.classList.remove(
            "level-poor",
            "level-very-low",
            "level-low",
            "level-medium",
            "level-high",
            "level-very-high",
            "level-exceptional"
        )

        if(level){
            let cls = "level-" + level.replace(/\s+/g,'-').toLowerCase()
            c.classList.add(cls)
        }

    })
}

/* =========================================================
   PLAYERLIST
   ---------------------------------------------------------
   Create player list from castles on map
========================================================= */

function updatePlayerList(){

    const list = document.getElementById("playerList")
    if(!list) return

    list.innerHTML = ""

    let players = []

    let avg = getAveragePower()

    document.querySelectorAll(".castle").forEach(c=>{

        let power = c.dataset.power || "0M"

        let value = parsePower(power)
        let level = getPowerLevel(value, avg)

        players.push({
            name: c.dataset.name,
            power: power,
            value: value,
            level: level
        })

    })

    players.sort((a,b)=> b.value - a.value)

    players.forEach(p=>{

        let el = document.createElement("div")
        let levelClass = p.level
            ? "level-" + p.level.replace(/\s+/g,'-').toLowerCase()
            : ""

        el.className = "player " + levelClass

        el.innerHTML = `
<div class="player-info">
    <span class="player-name">${p.name}</span>
    <span class="player-power">${p.power}</span>
</div>
<div class="edit">✎</div>
`

        /* highlight player + castle */
        el.addEventListener("click",()=>{

            const active = el.classList.contains("active")

            clearSelection()

            if(active) return

            el.classList.add("active")

            document.querySelectorAll(".castle").forEach(c=>{
                if(c.dataset.name === p.name){
                    c.classList.add("active")
                    highlightAxesForElement(c)
                    const mapWrapper = document.querySelector(".map-wrapper")
                    const rect = c.getBoundingClientRect()
                    const wrapperRect = mapWrapper.getBoundingClientRect()
                    const cx = rect.left + rect.width  / 2 - wrapperRect.left
                    const cy = rect.top  + rect.height / 2 - wrapperRect.top
                    mapWrapper.scrollBy({
                        left: cx - mapWrapper.clientWidth  / 2,
                        top:  cy - mapWrapper.clientHeight / 2,
                        behavior: "smooth"
                    })
                }
            })

        })

        /* edit button */
        el.querySelector(".edit").addEventListener("click",(e)=>{

            e.stopPropagation()

            let castle = Array.from(document.querySelectorAll(".castle"))
                .find(c => c.dataset.name === p.name)

            if(!castle) return

            editTarget = castle

            document.getElementById("castleName").value = castle.dataset.name
            document.getElementById("castlePower").value = castle.dataset.power
            setTrap(castle.dataset.trap || "F")

            const coords = getLogicalCoords(castle)
            document.getElementById("castleCoordX").value = originX + coords.x
            document.getElementById("castleCoordY").value = originY + coords.y

            castleDialogTitle.textContent = "Edit castle"
            castleAddBtn.textContent = "Update"
            castleDialog.classList.add("edit-mode")
            castleDialog.showModal()

        })

        list.appendChild(el)

    })

}

/* =========================================================
   STORAGE
   ---------------------------------------------------------
   Save layout to browser localStorage
========================================================= */

function saveLayout(){

    let layout=[]

    document.querySelectorAll(".castle,.banner,.trap,.plainshq").forEach(c=>{

        let size

        if(c.classList.contains("trap") || c.classList.contains("plainshq")) size=trapSize
        else if(c.classList.contains("banner")) size=1
        else size=castleSize

        let offset=(grid*size-c.offsetWidth)/2

        let tileX=Math.round((parseInt(c.style.left)-offset)/grid)
        let tileY=Math.round((parseInt(c.style.top)-offset)/grid)
        let logicalY=mapTilesY - tileY - size

        layout.push({
            type:c.classList.contains("trap")?"trap":
                c.classList.contains("banner")?"banner":
                    c.classList.contains("plainshq")?"plainshq":
                        "castle",
            name:c.dataset.name||"",
            power:c.dataset.power||"",
            trap:c.dataset.trap||"F",
            x:tileX,
            y:logicalY
        })

    })

    const save = {
        origin: { x: originX, y: originY },
        dimensions: { w: mapTilesX, h: mapTilesY },
        objects: layout
    }

    localStorage.setItem("kingshotLayout", JSON.stringify(save))

}

/* =========================================================
   LOAD LAYOUT
========================================================= */

function loadLayout(){

    id=1

    let data=localStorage.getItem("kingshotLayout")
    if(!data) return

    delete trap1.dataset.used
    delete trap2.dataset.used

    let parsed = JSON.parse(data)

    // Support both new {origin, objects} format and legacy bare array
    let layout, origin, dimensions
    if(Array.isArray(parsed)){
        layout = parsed
        origin = { x: 0, y: 0 }
        dimensions = { w: 40, h: 25 }
    } else {
        layout = parsed.objects || []
        origin = parsed.origin || { x: 0, y: 0 }
        dimensions = parsed.dimensions || { w: 40, h: 25 }
    }

    originX   = origin.x
    originY   = origin.y
    mapTilesX = dimensions.w
    mapTilesY = dimensions.h
    applyMapDimensions()
    updateOriginLabel()
    buildAxes()

    document.querySelectorAll(".castle,.banner,.plainshq").forEach(c=>c.remove())

    layout.forEach(c=>{

        if(c.type==="castle")
            createCastle(c.x*grid, (mapTilesY - castleSize - c.y)*grid, c.name, c.power, c.trap, true)
        if(c.type==="banner") createBanner(c.x*grid, (mapTilesY - 1 - c.y)*grid)
        if(c.type==="plainshq") createPlainsHQ(c.x*grid, (mapTilesY - trapSize - c.y)*grid)

        if(c.type==="trap"){

            let offset = trapOffset()

            if(!trap1.dataset.used){
                trap1.style.left=c.x*grid+offset+"px"
                trap1.style.top=(mapTilesY - trapSize - c.y)*grid+offset+"px"
                trap1.dataset.used=true
            }else{
                trap2.style.left=c.x*grid+offset+"px"
                trap2.style.top=(mapTilesY - trapSize - c.y)*grid+offset+"px"
            }

        }

    })
    updatePlayerList()
    applyCastleLevels()
}

function clearLayout(){

    originX = 0
    originY = 0
    mapTilesX = 40
    mapTilesY = 25
    applyMapDimensions()

    // adds empty layout to storage
    localStorage.setItem("kingshotLayout", JSON.stringify({ origin: { x: 0, y: 0 }, dimensions: { w: 40, h: 25 }, objects: [] }))

    // then load it to clear the map and reset all variables
    loadLayout()

    // finally, initialize as new with traps in starting position
    positionTraps()
}

/* =========================================================
   EXPORT / IMPORT
========================================================= */

function exportLayout(){

    let json = localStorage.getItem("kingshotLayout")

    if(!json){
        alert("No layout saved")
        return
    }

    let blob = new Blob([json], {type:"application/json"})
    let url = URL.createObjectURL(blob)

    let a = document.createElement("a")
    a.href = url
    a.download = "kingshot_layout.json"
    a.click()

    URL.revokeObjectURL(url)

}

function importLayout(file){

    if(!file) return

    let reader = new FileReader()

    reader.onload = function(e){

        localStorage.setItem(
            "kingshotLayout",
            e.target.result
        )

        loadLayout()

    }

    reader.readAsText(file)

}

async function shareLayout(){

    let json = localStorage.getItem("kingshotLayout")

    if(!json){
        alert("No layout saved")
        return
    }

    let blob = new Blob([json], {type:"application/json"})

    let form = new FormData()
    form.append("reqtype","fileupload")
    form.append("fileToUpload", blob, "layout.json")

    let r = await fetch("https://catbox.moe/user/api.php",{
        method:"POST",
        body:form
    })

    let url = await r.text()

    prompt("Share this link:", url)
}
function exportPlayerList(){

    let players = []

    document.querySelectorAll(".castle").forEach(c=>{

        let power = c.dataset.power || "0M"

        players.push({
            name: c.dataset.name || "",
            power: power,
            value: parseFloat(power)
        })

    })

    players.sort((a,b)=> b.value - a.value)

    let rows = players.map(p => `"${p.name}","${p.power}"`)

    let csv = "Name,Power\n" + rows.join("\n")

    let blob = new Blob([csv], {type:"text/csv"})
    let url = URL.createObjectURL(blob)

    let a = document.createElement("a")
    a.href = url
    a.download = "kingshot_players.csv"
    a.click()

    URL.revokeObjectURL(url)

}
async function exportScreenshot(){

    const mapEl = document.getElementById("map")

    // 🔹 backup huidige state
    const originalTransform = mapEl.style.transform

    // 🔹 force correcte rendering
    mapEl.style.transform = "scale(1)"
    mapEl.classList.add("export-mode")

    const canvas = await html2canvas(mapEl, {
        backgroundColor: "#1b1b1b",
        scale: 2,
        useCORS: true
    })

    // 🔹 restore
    mapEl.style.transform = originalTransform
    mapEl.classList.remove("export-mode")

    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob)

        const a = document.createElement("a")
        a.href = url
        a.download = "kingshot_map.png"
        a.click()

        URL.revokeObjectURL(url)
    })
}

/* =========================================================
   INITIALIZATION
========================================================= */

window.addEventListener("load", loadLayout)