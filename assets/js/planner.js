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

// API base URL — empty string means same origin (single-binary deployment).
// For static deployments this can be injected through window.__API_BASE__.
const API_BASE = (window.__API_BASE__ || "").replace(/\/+$/, "")

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
let dragCtrl = false

/* SELECTION STATE */
let activeObject = new Set()

/* RANK FILTER STATE */
let rankFilter = "All"

/* OBJECT STATE */
let id = 1
let spawnOffset = 0

/* VIEW STATE */
let zoom = 1

/* ORIGIN */
let originX = 0
let originY = 0

/* =========================================================
   TERRITORY OVERLAY
   ---------------------------------------------------------
   Draws a light tile fill for areas covered by banners (7x7)
   and Plains HQ (13x13).
========================================================= */

function updateTerritoryOverlay(){

    const canvas = document.getElementById("territoryCanvas")
    canvas.width  = mapTilesX * grid
    canvas.height = mapTilesY * grid

    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const covered = new Set()
    const highlighted = new Set()

    document.querySelectorAll(".banner").forEach(b => {
        const tileX = Math.round(parseFloat(b.style.left) / grid)
        const tileY = Math.round(parseFloat(b.style.top)  / grid)
        const isActive = activeObject.has(b)
        for(let dy = -3; dy <= 3; dy++){
            for(let dx = -3; dx <= 3; dx++){
                const tx = tileX + dx
                const ty = tileY + dy
                if(tx >= 0 && tx < mapTilesX && ty >= 0 && ty < mapTilesY){
                    covered.add(tx + "," + ty)
                    if(isActive) highlighted.add(tx + "," + ty)
                }
            }
        }
    })

    document.querySelectorAll(".plainshq").forEach(hq => {
        const offset = (grid * trapSize - hq.offsetWidth) / 2
        const tileX = Math.round((parseFloat(hq.style.left) - offset) / grid)
        const tileY = Math.round((parseFloat(hq.style.top)  - offset) / grid)
        const isActive = activeObject.has(hq)
        // center of 3x3 HQ footprint
        const cx = tileX + 1
        const cy = tileY + 1
        for(let dy = -6; dy <= 6; dy++){
            for(let dx = -6; dx <= 6; dx++){
                const tx = cx + dx
                const ty = cy + dy
                if(tx >= 0 && tx < mapTilesX && ty >= 0 && ty < mapTilesY){
                    covered.add(tx + "," + ty)
                    if(isActive) highlighted.add(tx + "," + ty)
                }
            }
        }
    })

    ctx.fillStyle = "rgba(255, 255, 255, 0.10)"
    covered.forEach(key => {
        const [tx, ty] = key.split(",").map(Number)
        ctx.fillRect(tx * grid, ty * grid, grid, grid)
    })

    if(highlighted.size){
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)"
        highlighted.forEach(key => {
            const [tx, ty] = key.split(",").map(Number)
            ctx.fillRect(tx * grid, ty * grid, grid, grid)
        })
    }

}

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
    if(activeObject.has(posDialogTarget)) highlightAxesForElement(posDialogTarget)
    updateTerritoryOverlay()
    posDialogTarget = null
    document.getElementById("posDialog").close()
}

window.addEventListener("load", function(){
    applyMapDimensions()
    buildAxes()
    positionTraps()
})

window.addEventListener("load", async function(){
    const params = new URLSearchParams(window.location.search)
    const layoutId = params.get("layout")
    if(layoutId){
        try {
            const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(layoutId))
            if(r.ok){
                const layout = await r.json()
                localStorage.setItem("kingshotLayout", layout.data)
                loadLayout()
                return
            }
        } catch(e) {
            console.error("Failed to load shared layout:", e)
        }
    }
    loadLayout()
})

window.addEventListener("load", function(){
    const mapWrapper = document.querySelector(".map-wrapper")
    const rect = trap1.getBoundingClientRect()
    const wrapperRect = mapWrapper.getBoundingClientRect()
    const cx = rect.left + rect.width  / 2 - wrapperRect.left
    const cy = rect.top  + rect.height / 2 - wrapperRect.top
    mapWrapper.scrollLeft += cx - mapWrapper.clientWidth  / 2
    mapWrapper.scrollTop  += cy - mapWrapper.clientHeight / 2
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
               el.classList.contains("castle") || el.classList.contains("allianceresource") ? castleSize : 1
    let offset = el.classList.contains("water") || el.classList.contains("mountain") ? 0 : (grid * size - el.offsetWidth) / 2
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
    document.querySelectorAll(".castle, .banner, .trap, .plainshq, .allianceresource, .water, .mountain").forEach(o => o.classList.remove("active"))
    document.querySelectorAll(".player").forEach(p => p.classList.remove("active"))
    clearAxisHighlights()
    activeObject.clear()
    updateTerritoryOverlay()
}

function selectMapObject(el, multi = false){
    const wasActive = el.classList.contains("active")

    if(!multi){
        // clear all others first, keeping toggle behaviour for the clicked element
        document.querySelectorAll(".castle, .banner, .trap, .plainshq, .allianceresource, .water, .mountain").forEach(o => {
            if(o !== el){ o.classList.remove("active"); activeObject.delete(o) }
        })
        document.querySelectorAll(".player").forEach(p => {
            const nameEl = p.querySelector(".player-name")
            if(!nameEl || nameEl.textContent !== el.dataset?.name) p.classList.remove("active")
        })
        clearAxisHighlights()
    }

    if(wasActive && multi){
        el.classList.remove("active")
        activeObject.delete(el)
        if(el.classList.contains("castle")){
            document.querySelectorAll(".player").forEach(p => {
                const nameEl = p.querySelector(".player-name")
                if(nameEl && nameEl.textContent === el.dataset.name) p.classList.remove("active")
            })
        }
    } else if(!wasActive){
        activeObject.add(el)
        el.classList.add("active")
        if(el.classList.contains("castle")){
            document.querySelectorAll(".player").forEach(p => {
                const nameEl = p.querySelector(".player-name")
                if(nameEl && nameEl.textContent === el.dataset.name) p.classList.add("active")
            })
        }
    } else if(!multi){
        // single-click on already-active sole object: deselect
        el.classList.remove("active")
        activeObject.delete(el)
        if(el.classList.contains("castle")){
            document.querySelectorAll(".player").forEach(p => {
                const nameEl = p.querySelector(".player-name")
                if(nameEl && nameEl.textContent === el.dataset.name) p.classList.remove("active")
            })
        }
    }

    clearAxisHighlights()
    if(activeObject.size === 1) highlightAxesForElement([...activeObject][0])
    updateTerritoryOverlay()
}

/* =========================================================
   OBJECT CREATION
   ---------------------------------------------------------
   Functions responsible for creating map objects
   (castles and banners)
========================================================= */

function isTileOccupied(tileX, tileY, size){

    const objects = document.querySelectorAll(".castle, .banner, .trap, .plainshq, .allianceresource, .water, .mountain")

    let mapRect = map.getBoundingClientRect()

    for(const obj of objects){

        let rect = obj.getBoundingClientRect()

        let x = rect.left - mapRect.left
        let y = rect.top  - mapRect.top

        let objSize =
            obj.classList.contains("trap") || obj.classList.contains("plainshq") ? trapSize :
                    obj.classList.contains("castle") || obj.classList.contains("allianceresource") ? castleSize :
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
function createCastle(x=0,y=0,name="",power="0M", trap="F", skipList=false, rank="R1"){

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
    c.dataset.trap = trap
    c.dataset.rank = rank || "R1"
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
    updateTerritoryOverlay()
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
    updateTerritoryOverlay()
}

function createAllianceResource(x=0, y=0){

    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, castleSize)){
        let free = findFreeTile(castleSize)
        tileX = free.x
        tileY = free.y
    }

    x = tileX * grid
    y = tileY * grid

    let ar = document.createElement("div")
    ar.className = "allianceresource"

    ar.innerHTML = `<div class="allianceresource-label">Alliance<br>Resource</div>`

    map.appendChild(ar)

    let offset = (grid * castleSize - ar.offsetWidth) / 2

    ar.style.left = x + offset + "px"
    ar.style.top  = y + offset + "px"

    makeDraggable(ar)
}

function createWater(x=0, y=0){

    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, 1)){
        let free = findFreeTile(1)
        tileX = free.x
        tileY = free.y
    }

    let w = document.createElement("div")
    w.className = "water"

    map.appendChild(w)

    w.style.left = tileX * grid + "px"
    w.style.top  = tileY * grid + "px"

    makeDraggable(w)
}

function createMountain(x=0, y=0){

    let tileX = Math.round(x / grid)
    let tileY = Math.round(y / grid)

    if(isTileOccupied(tileX, tileY, 1)){
        let free = findFreeTile(1)
        tileX = free.x
        tileY = free.y
    }

    let m = document.createElement("div")
    m.className = "mountain"

    map.appendChild(m)

    m.style.left = tileX * grid + "px"
    m.style.top  = tileY * grid + "px"

    makeDraggable(m)
}

/* =========================================================
   COORDINATE HELPERS
========================================================= */

function getLogicalCoords(el){
    let size = el.classList.contains("trap") || el.classList.contains("plainshq") ? trapSize :
               el.classList.contains("castle") || el.classList.contains("allianceresource") ? castleSize : 1
    let offset = el.classList.contains("water") || el.classList.contains("mountain") ? 0 : (grid * size - el.offsetWidth) / 2
    let tileX = Math.round((parseFloat(el.style.left) - offset) / grid)
    let tileY = Math.round((parseFloat(el.style.top)  - offset) / grid)
    return { x: tileX, y: mapTilesY - tileY - size }
}

function applyLogicalPosition(el, logicalX, logicalY){
    let size = el.classList.contains("trap") || el.classList.contains("plainshq") ? trapSize :
               el.classList.contains("castle") || el.classList.contains("allianceresource") ? castleSize : 1
    let offset = el.classList.contains("water") || el.classList.contains("mountain") ? 0 : (grid * size - el.offsetWidth) / 2
    el.style.left = logicalX * grid + offset + "px"
    el.style.top  = (mapTilesY - logicalY - size) * grid + offset + "px"
}

/* =========================================================
   TILE CONTEXT MENU
========================================================= */

let contextMenuTileX = 0
let contextMenuTileY = 0

const tileContextMenu   = document.getElementById("tileContextMenu")
const objectContextMenu = document.getElementById("objectContextMenu")

let contextMenuTarget = null

function hideAllContextMenus(){
    tileContextMenu.classList.remove("visible")
    objectContextMenu.classList.remove("visible")
}

map.addEventListener("contextmenu", (e)=>{
    e.preventDefault()
    hideAllContextMenus()

    const rect = map.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top)  / zoom

    // check if right-click landed on a map object
    const objectClasses = ["castle","banner","trap","plainshq","allianceresource","water","mountain"]
    const hit = objectClasses.reduce((found, cls) => found || e.target.closest("." + cls), null)

    if(hit){
        contextMenuTarget = hit
        objectContextMenu.style.left = e.clientX + "px"
        objectContextMenu.style.top  = e.clientY + "px"
        objectContextMenu.classList.add("visible")
    } else {
        contextMenuTarget = null
        contextMenuTileX = Math.floor(x / grid)
        contextMenuTileY = Math.floor(y / grid)
        tileContextMenu.style.left = e.clientX + "px"
        tileContextMenu.style.top  = e.clientY + "px"
        tileContextMenu.classList.add("visible")
    }
})

document.addEventListener("click", ()=>{
    hideAllContextMenus()
})

document.addEventListener("contextmenu", (e)=>{
    if(!e.target.closest("#map")){
        hideAllContextMenus()
    }
})

function objectContextEdit(){
    hideAllContextMenus()
    const el = contextMenuTarget
    if(!el) return

    if(el.classList.contains("castle")){
        editTarget = el
        document.getElementById("castleName").value = el.dataset.name
        document.getElementById("castlePower").value = el.dataset.power
        setTrap(el.dataset.trap || "F")
        setRank(el.dataset.rank || "R1")
        const coords = getLogicalCoords(el)
        document.getElementById("castleCoordX").value = originX + coords.x
        document.getElementById("castleCoordY").value = originY + coords.y
        castleDialogTitle.textContent = "Edit castle"
        castleAddBtn.textContent = "Update"
        castleDialog.classList.add("edit-mode")
        castleDialog.showModal()
    } else {
        let type = el.classList.contains("banner") ? "Banner" :
                   el.classList.contains("plainshq") ? "Plains HQ" :
                   el.classList.contains("allianceresource") ? "Alliance Resource" :
                   el.classList.contains("water") ? "Water" :
                   el.classList.contains("mountain") ? "Mountain" : "Trap"
        const coords = getLogicalCoords(el)
        document.getElementById("posDialogTitle").textContent = type + " position"
        document.getElementById("posX").value = originX + coords.x
        document.getElementById("posY").value = originY + coords.y
        posDialogTarget = el
        document.getElementById("posDialog").showModal()
    }
}

function objectContextDelete(){
    hideAllContextMenus()
    const el = contextMenuTarget
    if(!el) return
    let type = el.classList.contains("banner") ? "Banner" :
               el.classList.contains("plainshq") ? "Plains HQ" :
               el.classList.contains("allianceresource") ? "Alliance Resource" :
               el.classList.contains("water") ? "Water" :
               el.classList.contains("mountain") ? "Mountain" :
               el.classList.contains("castle") ? "Castle" : "Trap"
    deleteTarget = el
    document.getElementById("deleteText").textContent = type + " delete?"
    deleteDialog.showModal()
}

function contextMenuAdd(type){
    tileContextMenu.classList.remove("visible")
    const cssX = contextMenuTileX * grid
    const cssY = contextMenuTileY * grid
    if(type === "castle"){
        editTarget = null
        castleForm.reset()
        castleDialogTitle.textContent = "New castle"
        castleAddBtn.textContent = "Add"
        document.getElementById("castleCoordX").value = originX + contextMenuTileX
        document.getElementById("castleCoordY").value = originY + (mapTilesY - castleSize - contextMenuTileY)
        castleDialog.classList.add("edit-mode")
        castleDialog.showModal()
    } else if(type === "banner"){
        createBanner(cssX, cssY)
    } else if(type === "plainshq"){
        createPlainsHQ(cssX, cssY)
    } else if(type === "allianceresource"){
        createAllianceResource(cssX, cssY)
    } else if(type === "water"){
        createWater(cssX, cssY)
    } else if(type === "mountain"){
        createMountain(cssX, cssY)
    } else if(type === "trap"){
        const trap = document.createElement("div")
        trap.className = "trap"
        const num = document.querySelectorAll(".trap").length + 1
        trap.textContent = "Trap " + num
        map.appendChild(trap)
        const offset = (grid * trapSize - trap.offsetWidth) / 2
        trap.style.left = cssX + offset + "px"
        trap.style.top  = cssY + offset + "px"
        makeDraggable(trap)
    }
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

function addAllianceResource(){

    createAllianceResource(
        200 + spawnOffset * grid,
        200
    )

    spawnOffset++

}

function addWater(){

    createWater(
        200 + spawnOffset * grid,
        200
    )

    spawnOffset++

}

function addMountain(){

    createMountain(
        200 + spawnOffset * grid,
        200
    )

    spawnOffset++

}

function toggleAddMenu(){
    document.getElementById("addDropdownMenu").classList.toggle("open")
}

document.addEventListener("click", (e)=>{
    if(!e.target.closest(".add-dropdown")){
        const menu = document.getElementById("addDropdownMenu")
        if(menu) menu.classList.remove("open")
    }
})

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

function setRank(r, btn=null){

    document.getElementById("castleRank").value = r

    document.querySelectorAll(".rank-select button")
        .forEach(b => b.classList.remove("active"))

    if(btn){
        btn.classList.add("active")
    } else {
        document
            .querySelector(`.rank-select button[onclick*="'${r}'"]`)
            ?.classList.add("active")
    }

}

function setRankFilter(r, btn){
    rankFilter = r
    document.querySelectorAll("#rankFilter .rank-filter-btn")
        .forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
    updatePlayerList()
}

/* =========================================================
   BULK EDIT
========================================================= */

let bulkRankFilter = "All"

function setBulkRankFilter(r, btn){
    bulkRankFilter = r
    document.querySelectorAll("#bulkRankFilter .rank-filter-btn")
        .forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
    populateBulkTable()
}

function openBulkEdit(){
    bulkRankFilter = "All"
    document.querySelectorAll("#bulkRankFilter .rank-filter-btn")
        .forEach(b => b.classList.remove("active"))
    const allBtn = document.querySelector("#bulkRankFilter .rank-filter-btn")
    if(allBtn) allBtn.classList.add("active")
    populateBulkTable()
    document.getElementById("bulkEditDialog").showModal()
}

function populateBulkTable(){
    const tbody = document.getElementById("bulkTableBody")
    tbody.innerHTML = ""

    let players = []
    document.querySelectorAll(".castle").forEach(c => {
        players.push({
            el: c,
            name: c.dataset.name || "",
            power: c.dataset.power || "",
            rank: c.dataset.rank || "R1",
            value: parsePower(c.dataset.power)
        })
    })
    players.sort((a, b) => b.value - a.value)

    const filtered = bulkRankFilter === "All" ? players : players.filter(p => p.rank === bulkRankFilter)

    filtered.forEach(p => {
        const tr = document.createElement("tr")
        tr.dataset.name = p.name
        tr.innerHTML = `
<td><span class="player-rank">${p.rank}</span></td>
<td class="bulk-name">${p.name}</td>
<td><input class="bulk-power-input" type="text" value="${p.power}" data-name="${p.name}"></td>
`
        tbody.appendChild(tr)
    })

    // Tab on last row's input wraps to first
    const inputs = tbody.querySelectorAll("input")
    inputs.forEach((inp, i) => {
        inp.addEventListener("focus", () => inp.select())
        inp.addEventListener("keydown", e => {
            if(e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)){
                e.preventDefault()
                const next = inputs[i + 1]
                if(next) next.focus()
                else applyBulkEdit()
            }
        })
    })
}

function applyBulkEdit(){
    const inputs = document.querySelectorAll("#bulkTableBody .bulk-power-input")
    inputs.forEach(inp => {
        const name = inp.dataset.name
        const power = inp.value.trim()
        document.querySelectorAll(".castle").forEach(c => {
            if(c.dataset.name === name){
                c.dataset.power = power
                const powerEl = c.querySelector(".castle-power")
                if(powerEl) powerEl.textContent = power
            }
        })
    })
    applyCastleLevels()
    updatePlayerList()
    saveLayout()
    document.getElementById("bulkEditDialog").close()
}

document.getElementById("bulkCancelBtn").addEventListener("click", () => {
    document.getElementById("bulkEditDialog").close()
})

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
    let rank = document.getElementById("castleRank").value

    if(editTarget){

        editTarget.dataset.name = name
        editTarget.dataset.power = power
        editTarget.dataset.trap = trap
        editTarget.dataset.rank = rank

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
    } else {

        const coordX = parseInt(document.getElementById("castleCoordX").value)
        const coordY = parseInt(document.getElementById("castleCoordY").value)
        const useTileCoords = castleDialog.classList.contains("edit-mode")

        if(useTileCoords && !isNaN(coordX) && !isNaN(coordY)){
            const cssX = (coordX - originX) * grid
            const cssY = (mapTilesY - castleSize - (coordY - originY)) * grid
            createCastle(cssX, cssY, name, power, trap, false, rank)
        } else {
            createCastle(
                spawnOffset * castleSize * grid,
                0,
                name,
                power,
                trap,
                false,
                rank
            )
            spawnOffset++
        }
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
        updateTerritoryOverlay()
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
        dragCtrl = e.ctrlKey || e.metaKey

        let rect = el.getBoundingClientRect()

        offsetX = e.clientX - rect.left
        offsetY = e.clientY - rect.top

        selected.classList.add("dragging")
        selected.classList.add("drag-preview")

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
    else if(selected.classList.contains("banner") || selected.classList.contains("water") || selected.classList.contains("mountain"))
        size = 1
    else
        size = castleSize

    let offset = (grid*size - selected.offsetWidth)/2

    selected.style.left = x + offset + "px"
    selected.style.top  = y + offset + "px"

    selected.classList.remove("drag-preview")
    selected.classList.remove("dragging")

    updateTerritoryOverlay()

    if(!hasDragged){
        selectMapObject(selected, dragCtrl)
    } else if(activeObject.has(selected)){
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
            level: level,
            rank: c.dataset.rank || "R1"
        })

    })

    players.sort((a,b)=> b.value - a.value)

    const filtered = rankFilter === "All" ? players : players.filter(p => p.rank === rankFilter)

    filtered.forEach(p=>{

        let el = document.createElement("div")
        let levelClass = p.level
            ? "level-" + p.level.replace(/\s+/g,'-').toLowerCase()
            : ""

        el.className = "player " + levelClass

        el.innerHTML = `
<div class="player-info">
    <span class="player-rank">${p.rank}</span>
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
            setRank(castle.dataset.rank || "R1")

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

    document.querySelectorAll(".castle,.banner,.trap,.plainshq,.allianceresource,.water,.mountain").forEach(c=>{

        let size

        if(c.classList.contains("trap") || c.classList.contains("plainshq")) size=trapSize
        else if(c.classList.contains("castle") || c.classList.contains("allianceresource")) size=castleSize
        else size=1

        let offset = c.classList.contains("water") || c.classList.contains("mountain") ? 0 : (grid*size-c.offsetWidth)/2

        let tileX=Math.round((parseInt(c.style.left)-offset)/grid)
        let tileY=Math.round((parseInt(c.style.top)-offset)/grid)
        let logicalY=mapTilesY - tileY - size

        layout.push({
            type:c.classList.contains("trap")?"trap":
                c.classList.contains("banner")?"banner":
                    c.classList.contains("plainshq")?"plainshq":
                        c.classList.contains("allianceresource")?"allianceresource":
                            c.classList.contains("water")?"water":
                                c.classList.contains("mountain")?"mountain":
                                    "castle",
            name:c.dataset.name||"",
            power:c.dataset.power||"",
            trap:c.dataset.trap||"F",
            rank:c.dataset.rank||"R1",
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

document.querySelectorAll(".castle,.banner,.plainshq,.allianceresource,.water,.mountain").forEach(c=>c.remove())

    layout.forEach(c=>{

        if(c.type==="castle")
            createCastle(c.x*grid, (mapTilesY - castleSize - c.y)*grid, c.name, c.power, c.trap, true, c.rank||"R1")
        if(c.type==="banner") createBanner(c.x*grid, (mapTilesY - 1 - c.y)*grid)
        if(c.type==="plainshq") createPlainsHQ(c.x*grid, (mapTilesY - trapSize - c.y)*grid)
        if(c.type==="allianceresource") createAllianceResource(c.x*grid, (mapTilesY - castleSize - c.y)*grid)
        if(c.type==="water") createWater(c.x*grid, (mapTilesY - 1 - c.y)*grid)
        if(c.type==="mountain") createMountain(c.x*grid, (mapTilesY - 1 - c.y)*grid)

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
    updateTerritoryOverlay()
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

    try {
        const name = prompt("Name this layout for sharing:", "My Layout")
        if(!name) return

        const password = prompt("Set a password to protect edits (leave empty for none):", "")

        const r = await fetch(API_BASE + "/api/layouts/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, data: json, password: password || "" })
        })

        if(!r.ok){
            alert("Failed to save layout to server")
            return
        }

        const layout = await r.json()
        const shareUrl = location.origin + location.pathname + "?layout=" + layout.id

        prompt("Share this link:", shareUrl)

    } catch(e) {
        console.error("Share failed:", e)
        alert("Failed to share layout. Is the server running?")
    }
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
   SERVER LAYOUTS
   ---------------------------------------------------------
   Functions for interacting with the backend API
========================================================= */

async function listServerLayouts(){
    try {
        const r = await fetch(API_BASE + "/api/layouts/")
        if(!r.ok) return []
        return await r.json()
    } catch(e) {
        console.error("Failed to list server layouts:", e)
        return []
    }
}

async function loadFromServer(id){
    try {
        const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id))
        if(!r.ok){
            alert("Failed to load layout")
            return
        }
        const layout = await r.json()
        localStorage.setItem("kingshotLayout", layout.data)
        loadLayout()
        document.getElementById("serverLayoutsDialog").close()
    } catch(e) {
        console.error("Failed to load from server:", e)
        alert("Failed to load layout from server")
    }
}

async function saveToServer(){
    const json = localStorage.getItem("kingshotLayout")
    if(!json){
        alert("No layout saved locally. Save your layout first.")
        return
    }

    const name = document.getElementById("serverSaveName").value.trim()
    if(!name){
        alert("Please enter a name")
        return
    }

    const password = document.getElementById("serverSavePassword").value

    try {
        const r = await fetch(API_BASE + "/api/layouts/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, data: json, password: password || "" })
        })

        if(!r.ok){
            alert("Failed to save layout to server")
            return
        }

        const layout = await r.json()
        alert("Layout saved! ID: " + layout.id)
        document.getElementById("serverSaveName").value = ""
        document.getElementById("serverSavePassword").value = ""
        document.getElementById("saveToServerDialog").close()

    } catch(e) {
        console.error("Save to server failed:", e)
        alert("Failed to save to server. Is the server running?")
    }
}

async function updateOnServer(id){
    const json = localStorage.getItem("kingshotLayout")
    if(!json){
        alert("No layout saved locally")
        return
    }

    const password = prompt("Enter password (leave empty if none):", "")

    try {
        const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: json, password: password || "" })
        })

        if(r.status === 403){
            alert("Incorrect password")
            return
        }
        if(!r.ok){
            alert("Failed to update layout")
            return
        }

        alert("Layout updated!")
    } catch(e) {
        console.error("Update failed:", e)
        alert("Failed to update layout on server")
    }
}

async function deleteFromServer(id){
    if(!confirm("Delete this layout from the server?")) return

    const password = prompt("Enter password (leave empty if none):", "")

    try {
        const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password || "" })
        })

        if(r.status === 403){
            alert("Incorrect password")
            return
        }
        if(!r.ok){
            alert("Failed to delete layout")
            return
        }

        openServerLayouts()
    } catch(e) {
        console.error("Delete failed:", e)
        alert("Failed to delete layout from server")
    }
}

async function openServerLayouts(){
    const tbody = document.getElementById("serverLayoutsBody")
    tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>"
    document.getElementById("serverLayoutsDialog").showModal()

    const layouts = await listServerLayouts()

    if(layouts.length === 0){
        tbody.innerHTML = "<tr><td colspan='5'>No layouts found on server</td></tr>"
        return
    }

    tbody.innerHTML = ""
    layouts.forEach(l => {
        const tr = document.createElement("tr")
        const date = new Date(l.updated_at).toLocaleDateString()
        tr.innerHTML = `
            <td>${l.name}</td>
            <td>${l.has_password ? "🔒" : ""}</td>
            <td>${date}</td>
            <td>
                <button onclick="loadFromServer('${l.id}')">Load</button>
                <button onclick="updateOnServer('${l.id}')">Update</button>
                <button onclick="deleteFromServer('${l.id}')">Delete</button>
            </td>
        `
        tbody.appendChild(tr)
    })
}

function openSaveToServer(){
    document.getElementById("saveToServerDialog").showModal()
}

/* =========================================================
   INITIALIZATION
========================================================= */