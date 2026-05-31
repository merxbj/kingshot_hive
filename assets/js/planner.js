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
const LAYOUT_STORAGE_KEY = "kingshotLayout"

const DEFAULT_LAYOUT_META = {
    serverLayoutId: null,
    serverLayoutName: null,
    hasServerPassword: false,
    lastServerSync: null
}

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
const mapWrapper = document.querySelector(".map-wrapper")

const castleDialog = document.getElementById("castleDialog")
const castleForm = document.getElementById("castleForm")
const castleAddBtn = document.getElementById("castleAddBtn")
const castleDialogTitle = document.getElementById("castleDialogTitle")

const deleteDialog = document.getElementById("deleteDialog")
const deleteConfirm = document.getElementById("deleteConfirm")
const deleteCancel = document.getElementById("deleteCancel")

const publishDialog = document.getElementById("publishDialog")
const publishDialogTitle = document.getElementById("publishDialogTitle")
const publishNameInput = document.getElementById("publishName")
const publishPasswordInput = document.getElementById("publishPassword")
const publishDialogMessage = document.getElementById("publishDialogMessage")
const publishConfirmBtn = document.getElementById("publishConfirmBtn")
const publishCancelBtn = document.getElementById("publishCancelBtn")

const passwordRequestDialog = document.getElementById("passwordRequestDialog")
const passwordRequestText = document.getElementById("passwordRequestText")
const passwordRequestInput = document.getElementById("passwordRequestInput")
const passwordRequestMessage = document.getElementById("passwordRequestMessage")
const passwordConfirmBtn = document.getElementById("passwordConfirmBtn")
const passwordCancelBtn = document.getElementById("passwordCancelBtn")

const layoutManagerDialog = document.getElementById("layoutManagerDialog")
const layoutManagerCloseBtn = document.getElementById("layoutManagerCloseBtn")
const serverLayoutsBody = document.getElementById("serverLayoutsBody")
const lmCurrentStatus = document.getElementById("lmCurrentStatus")
const lmSaveAsBtn = document.getElementById("lmSaveAsBtn")
const lmCopyLinkBtn = document.getElementById("lmCopyLinkBtn")
const lmUnlinkBtn = document.getElementById("lmUnlinkBtn")

const saveStatus = document.getElementById("saveStatus")
const layoutImportFile = document.getElementById("layoutImportFile")
const layoutMenuCopyLink = document.getElementById("layoutMenuCopyLink")
const layoutMenuUnlink = document.getElementById("layoutMenuUnlink")

/* DIALOG STATE */
let editTarget = null
let deleteTarget = null
let posDialogTarget = null
let publishMode = "new"
let passwordRequestResolve = null

/* DRAG STATE */
let selected = null
let offsetX = 0
let offsetY = 0
let hasDragged = false
let dragCtrl = false

/* TOUCH DRAG STATE (hold 250ms to drag; move before timer fires = pan) */
let touchDragCandidate = null   // el being considered for drag
let touchDragTimer     = null   // setTimeout handle
let touchDragOffsetX   = 0     // touch offset within the element
let touchDragOffsetY   = 0
let touchDragStartX    = 0     // touch position at touchstart
let touchDragStartY    = 0
let touchDragReady     = false  // true once hold timer fires

/* MAP PAN STATE */
let isPanningMap = false
let mapPanStartX = 0
let mapPanStartY = 0
let mapPanScrollLeft = 0
let mapPanScrollTop = 0
let suppressNextMapClick = false

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

/* LAYOUT STATE */
let layoutMeta = { ...DEFAULT_LAYOUT_META }
let cachedServerPassword = null

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
                localStorage.setItem(LAYOUT_STORAGE_KEY, layout.data)
                loadLayout()
                saveLayout()
                setLayoutMeta({
                    serverLayoutId: layout.id,
                    serverLayoutName: layout.name,
                    hasServerPassword: layout.has_password,
                    lastServerSync: layout.updated_at || new Date().toISOString()
                })
                cachedServerPassword = null
                updateSaveStatus()
                return
            }
        } catch(e) {
            console.error("Failed to load shared layout:", e)
        }
    }
    loadLayout()
    updateSaveStatus()
})

window.addEventListener("load", function(){
    const rect = trap1.getBoundingClientRect()
    const wrapperRect = mapWrapper.getBoundingClientRect()
    const cx = rect.left + rect.width  / 2 - wrapperRect.left
    const cy = rect.top  + rect.height / 2 - wrapperRect.top
    mapWrapper.scrollLeft += cx - mapWrapper.clientWidth  / 2
    mapWrapper.scrollTop  += cy - mapWrapper.clientHeight / 2
})

map.addEventListener("click", (e)=>{
    if(suppressNextMapClick){
        suppressNextMapClick = false
        return
    }
    if(e.target === map) clearSelection()
})

map.addEventListener("mousedown", (e)=>{

    if(e.button !== 0) return
    if(e.target !== map) return

    isPanningMap = true
    mapPanStartX = e.clientX
    mapPanStartY = e.clientY
    mapPanScrollLeft = mapWrapper.scrollLeft
    mapPanScrollTop = mapWrapper.scrollTop
    map.style.cursor = "grabbing"

})

/* =========================================================
   TOUCH: MAP PAN + PINCH-TO-ZOOM + LONG-PRESS CONTEXT MENU
========================================================= */

let longPressTimer = null
let longPressTouchX = 0
let longPressTouchY = 0

map.addEventListener("touchstart",(e)=>{

    // Two fingers = pinch-to-zoom (cancel any pan/drag)
    if(e.touches.length === 2){
        isPanningMap = false
        clearTimeout(touchDragTimer)
        touchDragTimer = null
        if(touchDragCandidate) touchDragCandidate.classList.remove("drag-preview", "dragging")
        touchDragCandidate = null
        touchDragReady = false
        clearTimeout(longPressTimer)
        longPressTimer = null
        isPinching = true
        pinchStartDist = getTouchDist(e.touches)
        pinchStartZoom = zoom
        return
    }

    const touch = e.touches[0]

    // Long-press detection (only when touching empty map, not a draggable object)
    if(e.target === map){
        longPressTouchX = touch.clientX
        longPressTouchY = touch.clientY

        longPressTimer = setTimeout(()=>{
            longPressTimer = null
            suppressNextMapClick = true
            hideAllContextMenus()

            const rect = map.getBoundingClientRect()
            const x = (longPressTouchX - rect.left) / zoom
            const y = (longPressTouchY - rect.top)  / zoom

            const objectClasses = ["castle","banner","trap","plainshq","allianceresource","water","mountain"]
            const el = document.elementFromPoint(longPressTouchX, longPressTouchY)
            const hit = el ? objectClasses.reduce((found, cls) => found || el.closest("." + cls), null) : null

            if(hit){
                contextMenuTarget = hit
                objectContextMenu.style.left = longPressTouchX + "px"
                objectContextMenu.style.top  = longPressTouchY + "px"
                objectContextMenu.classList.add("visible")
            } else {
                contextMenuTarget = null
                contextMenuTileX = Math.floor(x / grid)
                contextMenuTileY = Math.floor(y / grid)
                tileContextMenu.style.left = longPressTouchX + "px"
                tileContextMenu.style.top  = longPressTouchY + "px"
                tileContextMenu.classList.add("visible")
            }

            navigator.vibrate?.(50)
        }, 500)

        // Single-finger pan starts on empty map
        isPanningMap = true
        mapPanStartX = touch.clientX
        mapPanStartY = touch.clientY
        mapPanScrollLeft = mapWrapper.scrollLeft
        mapPanScrollTop = mapWrapper.scrollTop
    }

}, { passive: true })

map.addEventListener("touchend",()=>{
    clearTimeout(longPressTimer)
    longPressTimer = null
})

map.addEventListener("touchmove",(e)=>{
    // Cancel long-press if finger moved significantly
    if(longPressTimer && e.touches.length === 1){
        const touch = e.touches[0]
        const dx = touch.clientX - longPressTouchX
        const dy = touch.clientY - longPressTouchY
        if(Math.abs(dx) > 8 || Math.abs(dy) > 8){
            clearTimeout(longPressTimer)
            longPressTimer = null
        }
    }
    // Pinch-to-zoom live update
    if(isPinching && e.touches.length === 2){
        const dist = getTouchDist(e.touches)
        const ratio = dist / pinchStartDist
        zoom = Math.min(2, Math.max(0.75, pinchStartZoom * ratio))
        map.style.transform = `scale(${zoom})`
        map.style.transformOrigin = "top left"
    }
}, { passive: true })

// Dismiss context menus on touch outside
document.addEventListener("touchstart",(e)=>{
    if(!e.target.closest(".context-menu")) hideAllContextMenus()
}, { passive: true })

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
    const menu = document.getElementById("addDropdownMenu")
    const shouldOpen = !menu.classList.contains("open")
    closeToolbarMenus()
    if(shouldOpen) menu.classList.add("open")
}

function toggleLayoutMenu(){
    const menu = document.getElementById("layoutDropdownMenu")
    const shouldOpen = !menu.classList.contains("open")
    closeToolbarMenus()
    if(shouldOpen) menu.classList.add("open")
}

function closeToolbarMenus(){
    document.getElementById("addDropdownMenu")?.classList.remove("open")
    document.getElementById("layoutDropdownMenu")?.classList.remove("open")
}

function toggleMobileMenu(){
    const toolbar = document.querySelector(".toolbar-container")
    const btn     = document.querySelector(".mobile-menu-btn")
    const isOpen  = toolbar.classList.toggle("mobile-open")
    btn.classList.toggle("menu-open", isOpen)
    if(!isOpen) closeToolbarMenus()
}

document.addEventListener("click", (e)=>{
    if(!e.target.closest(".add-dropdown")) closeToolbarMenus()
    // Close mobile menu when tapping anywhere outside it
    if(!e.target.closest(".toolbar-container") && !e.target.closest(".mobile-toolbar-toggle")){
        const toolbar = document.querySelector(".toolbar-container")
        const btn     = document.querySelector(".mobile-menu-btn")
        if(toolbar?.classList.contains("mobile-open")){
            toolbar.classList.remove("mobile-open")
            btn?.classList.remove("menu-open")
            closeToolbarMenus()
        }
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
   Handles dragging of objects on the map (mouse + touch)
========================================================= */

function makeDraggable(el){

    // ---- Mouse ----
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

    // ---- Touch (hold 250ms without significant movement to arm drag) ----
    el.addEventListener("touchstart",(e)=>{

        if(e.touches.length !== 1) return

        clearTimeout(touchDragTimer)
        touchDragTimer = null

        const touch = e.touches[0]
        const rect  = el.getBoundingClientRect()

        touchDragCandidate = el
        touchDragOffsetX   = touch.clientX - rect.left
        touchDragOffsetY   = touch.clientY - rect.top
        touchDragStartX    = touch.clientX
        touchDragStartY    = touch.clientY
        touchDragReady     = false

        // After 250ms of stillness, arm drag mode with visual + haptic feedback
        touchDragTimer = setTimeout(()=>{
            touchDragTimer = null
            if(touchDragCandidate === el){
                touchDragReady = true
                el.classList.add("drag-preview")
                navigator.vibrate?.(20)
            }
        }, 250)

    }, { passive: true })

}

/* =========================================================
   DRAG MOVEMENT
========================================================= */

document.addEventListener("mousemove",(e)=>{

    if(isPanningMap){
        const dx = e.clientX - mapPanStartX
        const dy = e.clientY - mapPanStartY
        mapWrapper.scrollLeft = mapPanScrollLeft - dx
        mapWrapper.scrollTop  = mapPanScrollTop  - dy
        if(Math.abs(dx) > 2 || Math.abs(dy) > 2) suppressNextMapClick = true
        return
    }

    if(!selected) return

    hasDragged = true

    let rect = map.getBoundingClientRect()

    let x = (e.clientX - rect.left - offsetX) / zoom
    let y = (e.clientY - rect.top  - offsetY) / zoom

    selected.style.left = x + "px"
    selected.style.top  = y + "px"

})

document.addEventListener("touchmove",(e)=>{

    // Pinch-to-zoom: handled separately
    if(isPinching) return

    const touch = e.touches.length > 0 ? e.touches[0] : null
    if(!touch) return

    // Touch drag candidate: decide between pan and drag based on hold timer
    if(touchDragCandidate && !selected){
        const dx = touch.clientX - touchDragStartX
        const dy = touch.clientY - touchDragStartY

        if(touchDragReady){
            // Hold timer fired — small movement commits drag
            if(Math.abs(dx) > 3 || Math.abs(dy) > 3){
                selected           = touchDragCandidate
                offsetX            = touchDragOffsetX
                offsetY            = touchDragOffsetY
                hasDragged         = false
                dragCtrl           = false
                touchDragCandidate = null
                touchDragReady     = false
                selected.classList.add("dragging")
                // drag-preview already on element from when timer fired
                // fall through to drag movement below
            } else {
                return // barely moved yet after arming
            }
        } else if(Math.abs(dx) > 10 || Math.abs(dy) > 10){
            // Moved before hold timer fired → cancel drag, switch to map pan
            clearTimeout(touchDragTimer)
            touchDragTimer = null
            touchDragCandidate.classList.remove("drag-preview", "dragging")
            touchDragCandidate = null
            touchDragReady     = false
            isPanningMap       = true
            mapPanStartX       = touch.clientX
            mapPanStartY       = touch.clientY
            mapPanScrollLeft   = mapWrapper.scrollLeft
            mapPanScrollTop    = mapWrapper.scrollTop
            // fall through to panning below
        } else {
            return // in slop zone, waiting for timer or more movement
        }
    }

    // Map panning
    if(isPanningMap && e.touches.length === 1){
        const dx = touch.clientX - mapPanStartX
        const dy = touch.clientY - mapPanStartY
        mapWrapper.scrollLeft = mapPanScrollLeft - dx
        mapWrapper.scrollTop  = mapPanScrollTop  - dy
        if(Math.abs(dx) > 4 || Math.abs(dy) > 4) suppressNextMapClick = true
        return
    }

    if(!selected) return
    if(e.touches.length !== 1) return

    e.preventDefault() // prevent page scroll while dragging an object

    hasDragged = true

    let rect = map.getBoundingClientRect()

    let x = (touch.clientX - rect.left - offsetX) / zoom
    let y = (touch.clientY - rect.top  - offsetY) / zoom

    selected.style.left = x + "px"
    selected.style.top  = y + "px"

}, { passive: false })

/* =========================================================
   GRID SNAP
   ---------------------------------------------------------
   Snap objects to the grid when released
========================================================= */

function snapSelected(){

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
}

document.addEventListener("mouseup",()=>{

    if(isPanningMap){
        isPanningMap = false
        map.style.cursor = ""
    }

    if(!selected) return

    snapSelected()

})

document.addEventListener("touchend",()=>{

    // Always clean up hold timer
    clearTimeout(touchDragTimer)
    touchDragTimer = null

    // Finger lifted while holding a candidate → treat as tap (no drag committed)
    if(touchDragCandidate){
        const el   = touchDragCandidate
        touchDragCandidate = null
        touchDragReady     = false
        el.classList.remove("drag-preview", "dragging")
        selectMapObject(el, false)
        return
    }

    if(isPanningMap){
        isPanningMap = false
    }

    if(isPinching){
        // Snap to nearest valid zoom level
        const levels = [0.75, 1, 1.5, 2]
        let nearest = levels.reduce((prev, cur) =>
            Math.abs(cur - zoom) < Math.abs(prev - zoom) ? cur : prev
        )
        const btn = document.querySelector(`.zoom-btn[onclick*="${nearest}"]`)
        setZoom(nearest, btn || document.querySelector(".zoom-btn"))
        isPinching = false
        pinchStartDist = 0
        pinchStartZoom = 1
        return
    }

    if(!selected) return

    snapSelected()

})

/* =========================================================
   MAP PANNING & PINCH-TO-ZOOM (TOUCH)
   ---------------------------------------------------------
   Single-finger on empty map = pan; two-finger = zoom
========================================================= */

/* Pinch state */
let isPinching = false
let pinchStartDist = 0
let pinchStartZoom = 1

function getTouchDist(touches){
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx*dx + dy*dy)
}

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

function normalizeLayoutMeta(meta = {}){
    return {
        ...DEFAULT_LAYOUT_META,
        ...(meta && typeof meta === "object" ? meta : {})
    }
}

function getStoredLayoutData(){
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if(!raw) return null

    try {
        return JSON.parse(raw)
    } catch(e) {
        console.error("Failed to parse stored layout:", e)
        return null
    }
}

function setDialogMessage(el, message, type = "error"){
    if(!el) return
    el.textContent = message || ""
    el.classList.remove("hidden", "error", "success")
    if(!message){
        el.classList.add("hidden")
        return
    }
    el.classList.add(type)
}

function formatSyncLabel(value){
    if(!value) return "Never synced"
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return "Synced"
    return "Synced " + date.toLocaleString()
}

function updateSaveStatus(){
    const meta = getLayoutMeta()
    layoutMeta = meta

    if(saveStatus){
        if(meta.serverLayoutId){
            const name = meta.serverLayoutName || "Server layout"
            saveStatus.textContent = name + " • " + formatSyncLabel(meta.lastServerSync)
        } else {
            saveStatus.textContent = "Local only"
        }
    }

    layoutMenuCopyLink?.classList.toggle("hidden", !meta.serverLayoutId)
    layoutMenuUnlink?.classList.toggle("hidden", !meta.serverLayoutId)
    lmCopyLinkBtn?.classList.toggle("hidden", !meta.serverLayoutId)
    lmUnlinkBtn?.classList.toggle("hidden", !meta.serverLayoutId)
}

function getLayoutMeta(){
    const stored = getStoredLayoutData()
    if(!stored || Array.isArray(stored)) return { ...DEFAULT_LAYOUT_META }
    return normalizeLayoutMeta(stored._meta)
}

function setLayoutMeta(updates = {}){
    const stored = getStoredLayoutData()
    if(!stored || Array.isArray(stored)){
        layoutMeta = normalizeLayoutMeta({ ...layoutMeta, ...updates })
        return layoutMeta
    }

    layoutMeta = normalizeLayoutMeta({ ...stored._meta, ...updates })
    stored._meta = layoutMeta
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(stored))
    return layoutMeta
}

function saveLayout(){

    const existingMeta = getLayoutMeta()

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
        _meta: existingMeta,
        origin: { x: originX, y: originY },
        dimensions: { w: mapTilesX, h: mapTilesY },
        objects: layout
    }

    layoutMeta = existingMeta
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(save))
    updateSaveStatus()

}

/* =========================================================
   LOAD LAYOUT
========================================================= */

function loadLayout(){

    id=1

    const stored = getStoredLayoutData()
    if(!stored) return

    delete trap1.dataset.used
    delete trap2.dataset.used

    // Support both new {origin, objects} format and legacy bare array
    let layout, origin, dimensions
    if(Array.isArray(stored)){
        layout = stored
        origin = { x: 0, y: 0 }
        dimensions = { w: 40, h: 25 }
        layoutMeta = { ...DEFAULT_LAYOUT_META }
    } else {
        layout = stored.objects || []
        origin = stored.origin || { x: 0, y: 0 }
        dimensions = stored.dimensions || { w: 40, h: 25 }
        layoutMeta = normalizeLayoutMeta(stored._meta)
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
    updateSaveStatus()
}

function clearLayout(){

    originX = 0
    originY = 0
    mapTilesX = 40
    mapTilesY = 25
    layoutMeta = { ...DEFAULT_LAYOUT_META }
    cachedServerPassword = null
    applyMapDimensions()

    // adds empty layout to storage
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
        _meta: layoutMeta,
        origin: { x: 0, y: 0 },
        dimensions: { w: 40, h: 25 },
        objects: []
    }))

    // then load it to clear the map and reset all variables
    loadLayout()

    // finally, initialize as new with traps in starting position
    positionTraps()
    updateSaveStatus()
}

/* =========================================================
   EXPORT / IMPORT
========================================================= */

function exportLayout(){

    let json = localStorage.getItem(LAYOUT_STORAGE_KEY)

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
            LAYOUT_STORAGE_KEY,
            e.target.result
        )

        loadLayout()

    }

    reader.readAsText(file)

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
        localStorage.setItem(LAYOUT_STORAGE_KEY, layout.data)
        loadLayout()
        saveLayout()
        setLayoutMeta({
            serverLayoutId: layout.id,
            serverLayoutName: layout.name,
            hasServerPassword: layout.has_password,
            lastServerSync: layout.updated_at || new Date().toISOString()
        })
        cachedServerPassword = null
        updateSaveStatus()
        layoutManagerDialog.close()
    } catch(e) {
        console.error("Failed to load from server:", e)
        alert("Failed to load layout from server")
    }
}

function openPublishDialog(mode = "new", prefillName = ""){
    publishMode = mode
    publishDialogTitle.textContent = mode === "saveas" ? "Save As New Layout" : "Publish Layout"
    publishConfirmBtn.textContent = mode === "saveas" ? "Save As" : "Publish"
    publishNameInput.value = prefillName || layoutMeta.serverLayoutName || ""
    publishPasswordInput.value = ""
    setDialogMessage(publishDialogMessage, "")
    if(layoutManagerDialog?.open) layoutManagerDialog.close()
    publishDialog.showModal()
    publishNameInput.focus()
}

async function publishLayout(name, password){
    const json = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if(!json){
        setDialogMessage(publishDialogMessage, "No local layout is available to publish.")
        return
    }

    try {
        const r = await fetch(API_BASE + "/api/layouts/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, data: json, password: password || "" })
        })

        if(!r.ok){
            setDialogMessage(publishDialogMessage, "Failed to publish layout.")
            return
        }

        const layout = await r.json()
        setLayoutMeta({
            serverLayoutId: layout.id,
            serverLayoutName: layout.name,
            hasServerPassword: !!password,
            lastServerSync: layout.updated_at || new Date().toISOString()
        })
        cachedServerPassword = password || null
        publishDialog.close()
        updateSaveStatus()
    } catch(e) {
        console.error("Publish failed:", e)
        setDialogMessage(publishDialogMessage, "Failed to publish layout. Is the server running?")
    }
}

async function requestPassword(message, errorMessage = ""){
    passwordRequestText.textContent = message
    passwordRequestInput.value = ""
    setDialogMessage(passwordRequestMessage, errorMessage)
    passwordRequestDialog.showModal()
    passwordRequestInput.focus()

    return new Promise(resolve => {
        passwordRequestResolve = resolve
    })
}

async function updateLinkedLayout(id, password = ""){
    const json = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if(!json) return { ok: false, status: 0 }

    try {
        const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: json, password: password || "" })
        })

        return { ok: r.ok, status: r.status }
    } catch(e) {
        console.error("Update failed:", e)
        return { ok: false, status: 0, error: e }
    }
}

async function smartSave(){
    saveLayout()

    const meta = getLayoutMeta()
    if(!meta.serverLayoutId){
        openPublishDialog("new", meta.serverLayoutName || "")
        return
    }

    let result = await updateLinkedLayout(meta.serverLayoutId, cachedServerPassword || "")

    if(result.ok){
        setLayoutMeta({ lastServerSync: new Date().toISOString() })
        updateSaveStatus()
        return
    }

    if(result.status === 404){
        cachedServerPassword = null
        setLayoutMeta({
            serverLayoutId: null,
            serverLayoutName: meta.serverLayoutName,
            hasServerPassword: false,
            lastServerSync: null
        })
        updateSaveStatus()
        openPublishDialog("new", meta.serverLayoutName || "")
        return
    }

    if(result.status === 403){
        cachedServerPassword = null
        let passwordMessage = ""

        while(result.status === 403){
            const password = await requestPassword(
                "Enter the password for \"" + (meta.serverLayoutName || "this layout") + "\".",
                passwordMessage
            )
            if(password === null) return

            result = await updateLinkedLayout(meta.serverLayoutId, password)
            if(result.ok){
                cachedServerPassword = password
                setLayoutMeta({ lastServerSync: new Date().toISOString() })
                updateSaveStatus()
                return
            }

            passwordMessage = result.status === 403 ? "Incorrect password." : "Failed to save layout to server."
        }
    }

    alert("Failed to save layout to server")
}

async function deleteServerLayout(id, name, hasPassword){
    if(!confirm("Delete this layout from the server?")) return

    let password = ""
    if(hasPassword){
        let passwordMessage = ""

        while(true){
            password = await requestPassword(
                "Enter the password to delete \"" + name + "\".",
                passwordMessage
            )
            if(password === null) return

            try {
                const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id), {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: password || "" })
                })

                if(r.status === 403){
                    passwordMessage = "Incorrect password."
                    continue
                }
                if(!r.ok){
                    alert("Failed to delete layout")
                    return
                }

                const meta = getLayoutMeta()
                if(meta.serverLayoutId === id){
                    cachedServerPassword = null
                    setLayoutMeta({
                        serverLayoutId: null,
                        serverLayoutName: null,
                        hasServerPassword: false,
                        lastServerSync: null
                    })
                    updateSaveStatus()
                }

                await refreshLayoutManager()
                return
            } catch(e) {
                console.error("Delete failed:", e)
                alert("Failed to delete layout from server")
                return
            }
        }
    }

    try {
        const r = await fetch(API_BASE + "/api/layouts/" + encodeURIComponent(id), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password || "" })
        })

        if(r.status === 403){
            setDialogMessage(passwordRequestMessage, "Incorrect password.")
            passwordRequestDialog.showModal()
            return
        }
        if(!r.ok){
            alert("Failed to delete layout")
            return
        }

        const meta = getLayoutMeta()
        if(meta.serverLayoutId === id){
            cachedServerPassword = null
            setLayoutMeta({
                serverLayoutId: null,
                serverLayoutName: null,
                hasServerPassword: false,
                lastServerSync: null
            })
            updateSaveStatus()
        }

        await refreshLayoutManager()
    } catch(e) {
        console.error("Delete failed:", e)
        alert("Failed to delete layout from server")
    }
}

function renderLayoutManagerStatus(){
    const meta = getLayoutMeta()
    if(!meta.serverLayoutId){
        lmCurrentStatus.textContent = "This layout is stored locally only. Saving will publish it as a new server layout."
    } else {
        lmCurrentStatus.textContent = "Linked to \"" + (meta.serverLayoutName || meta.serverLayoutId) + "\". " + formatSyncLabel(meta.lastServerSync)
    }
    updateSaveStatus()
}

async function refreshLayoutManager(){
    renderLayoutManagerStatus()
    serverLayoutsBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>"

    const layouts = await listServerLayouts()

    if(layouts.length === 0){
        serverLayoutsBody.innerHTML = "<tr><td colspan='4'>No layouts found on server</td></tr>"
        return
    }

    serverLayoutsBody.innerHTML = ""
    layouts.forEach(l => {
        const tr = document.createElement("tr")
        const date = new Date(l.updated_at).toLocaleDateString()
        const actions = document.createElement("td")
        const openBtn = document.createElement("button")
        openBtn.type = "button"
        openBtn.textContent = "Open"
        openBtn.addEventListener("click", () => loadFromServer(l.id))

        const saveAsBtn = document.createElement("button")
        saveAsBtn.type = "button"
        saveAsBtn.textContent = "Save As"
        saveAsBtn.addEventListener("click", () => openPublishDialog("saveas", l.name))

        const deleteBtn = document.createElement("button")
        deleteBtn.type = "button"
        deleteBtn.textContent = "Delete"
        deleteBtn.addEventListener("click", () => deleteServerLayout(l.id, l.name, l.has_password))

        actions.appendChild(openBtn)
        actions.appendChild(saveAsBtn)
        actions.appendChild(deleteBtn)

        const name = document.createElement("td")
        name.textContent = l.name

        const password = document.createElement("td")
        password.textContent = l.has_password ? "🔒" : ""

        const updated = document.createElement("td")
        updated.textContent = date

        tr.appendChild(name)
        tr.appendChild(password)
        tr.appendChild(updated)
        tr.appendChild(actions)
        serverLayoutsBody.appendChild(tr)
    })
}

async function openLayoutManager(){
    renderLayoutManagerStatus()
    layoutManagerDialog.showModal()
    await refreshLayoutManager()
}

async function copyShareLink(id){
    const shareUrl = location.origin + location.pathname + "?layout=" + id

    try {
        await navigator.clipboard.writeText(shareUrl)
    } catch(e) {
        console.error("Clipboard copy failed:", e)
        alert(shareUrl)
    }
}

async function copyCurrentShareLink(){
    const meta = getLayoutMeta()
    if(!meta.serverLayoutId) return
    await copyShareLink(meta.serverLayoutId)
}

function unlinkLayout(){
    cachedServerPassword = null
    setLayoutMeta({
        serverLayoutId: null,
        serverLayoutName: null,
        hasServerPassword: false,
        lastServerSync: null
    })
    updateSaveStatus()
    renderLayoutManagerStatus()
}

publishConfirmBtn.addEventListener("click", async () => {
    const name = publishNameInput.value.trim()
    if(!name){
        setDialogMessage(publishDialogMessage, "Please enter a layout name.")
        return
    }

    saveLayout()
    await publishLayout(name, publishPasswordInput.value)
})

publishCancelBtn.addEventListener("click", () => {
    publishDialog.close()
})

passwordConfirmBtn.addEventListener("click", () => {
    if(!passwordRequestResolve) return
    const resolve = passwordRequestResolve
    passwordRequestResolve = null
    passwordRequestDialog.close()
    resolve(passwordRequestInput.value)
})

passwordCancelBtn.addEventListener("click", () => {
    if(!passwordRequestResolve){
        passwordRequestDialog.close()
        return
    }
    const resolve = passwordRequestResolve
    passwordRequestResolve = null
    passwordRequestDialog.close()
    resolve(null)
})

layoutManagerCloseBtn.addEventListener("click", () => {
    layoutManagerDialog.close()
})

lmSaveAsBtn.addEventListener("click", () => {
    openPublishDialog("saveas", layoutMeta.serverLayoutName || "")
})

lmCopyLinkBtn.addEventListener("click", () => {
    copyCurrentShareLink()
})

lmUnlinkBtn.addEventListener("click", () => {
    unlinkLayout()
})

layoutImportFile.addEventListener("change", () => {
    importLayout(layoutImportFile.files[0])
    layoutImportFile.value = ""
})

/* =========================================================
   INITIALIZATION
========================================================= */