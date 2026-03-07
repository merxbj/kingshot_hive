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

const mapTiles = 30
let centerTile = mapTiles / 2
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

/* DRAG STATE */
let selected = null
let offsetX = 0
let offsetY = 0

/* OBJECT STATE */
let id = 1
let spawnOffset = 0

/* VIEW STATE */
let zoom = 1

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

function positionTraps(){

    let offset = trapOffset()

    trap1.style.left = startTile * grid + offset + "px"
    trap1.style.top  = startTile * grid + offset + "px"

    trap2.style.left = (startTile + 6) * grid + offset + "px"
    trap2.style.top  = startTile * grid + offset + "px"

}

window.addEventListener("load", positionTraps)

/* =========================================================
   OBJECT CREATION
   ---------------------------------------------------------
   Functions responsible for creating map objects
   (castles and banners)
========================================================= */

function isTileOccupied(tileX, tileY, size){

    const objects = document.querySelectorAll(".castle, .banner, .trap")

    let mapRect = map.getBoundingClientRect()

    for(const obj of objects){

        let rect = obj.getBoundingClientRect()

        let x = rect.left - mapRect.left
        let y = rect.top  - mapRect.top

        let objSize = obj.classList.contains("trap") ? trapSize :
            obj.classList.contains("castle") ? castleSize : 1

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

    for(let y = 0; y < mapTiles; y++){
        for(let x = 0; x < mapTiles; x++){

            if(!isTileOccupied(x, y, size)){
                return {x, y}
            }

        }
    }

    return {x:0, y:0}
}
function createCastle(x=0,y=0,name="",power="0M"){

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
    c.dataset.power=power
    c.className="castle"

    if(!name) name="Castle "+id

    c.innerHTML=`
<div class="castle-name">${name}</div>
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

function setZoom(value, btn){

    zoom = value

    map.style.transform = `scale(${zoom})`
    map.style.transformOrigin = "top left"

    document.querySelectorAll(".zoom-btn").forEach(b=>{
        b.classList.remove("active")
    })

    btn.classList.add("active")
}

/* =========================================================
   CASTLE DIALOG HANDLING
========================================================= */

// Cancel button
document.getElementById("castleCancelBtn").addEventListener("click", () => {
    castleDialog.close()
})

// Add button (form submit)
castleForm.addEventListener("submit", (e) => {

    e.preventDefault()

    let name = document.getElementById("castleName").value
    let power = document.getElementById("castlePower").value || "0M"

    if(editTarget){

        editTarget.dataset.name = name
        editTarget.dataset.power = power

        editTarget.innerHTML = `
<div class="castle-name">${name}</div>
<div class="castle-power">${power}</div>
`

    }else{

        createCastle(
            spawnOffset * castleSize * grid,
            0,
            name,
            power
        )

        spawnOffset++
    }

    castleDialog.close()

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

        selected = el

        let rect = el.getBoundingClientRect()

        offsetX = e.clientX - rect.left
        offsetY = e.clientY - rect.top

        selected.classList.add("dragging")
        selected.classList.add("drag-preview")

    })


    el.addEventListener("contextmenu",(e)=>{

        e.preventDefault()

        if(el.classList.contains("castle") || el.classList.contains("banner")){

            let type = el.classList.contains("banner") ? "Banner" : "Castle"

            deleteTarget = el
            document.getElementById("deleteText").textContent = type + " delete?"
            deleteDialog.showModal()

        }

    })


    el.addEventListener("dblclick",()=>{

        if(!el.classList.contains("castle")) return

        editTarget = el

        document.getElementById("castleName").value = el.dataset.name
        document.getElementById("castlePower").value = el.dataset.power

        castleDialogTitle.textContent = "Edit castle"
        castleAddBtn.textContent = "Update"

        castleDialog.showModal()

    })

}

/* =========================================================
   DRAG MOVEMENT
========================================================= */

document.addEventListener("mousemove",(e)=>{

    if(!selected) return

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

    if(selected.classList.contains("trap")) size = trapSize
    else if(selected.classList.contains("banner")) size = 1
    else size = castleSize

    let offset = (grid*size - selected.offsetWidth)/2

    selected.style.left = x + offset + "px"
    selected.style.top  = y + offset + "px"

    selected.classList.remove("drag-preview")
    selected.classList.remove("dragging")

    selected = null

})

/* =========================================================
   STORAGE
   ---------------------------------------------------------
   Save layout to browser localStorage
========================================================= */

function saveLayout(){

    let layout=[]

    document.querySelectorAll(".castle,.banner,.trap").forEach(c=>{

        let size

        if(c.classList.contains("trap")) size=trapSize
        else if(c.classList.contains("banner")) size=1
        else size=castleSize

        let offset=(grid*size-c.offsetWidth)/2

        let tileX=Math.round((parseInt(c.style.left)-offset)/grid)
        let tileY=Math.round((parseInt(c.style.top)-offset)/grid)

        layout.push({
            type:c.classList.contains("trap")?"trap":
                c.classList.contains("banner")?"banner":"castle",
            name:c.dataset.name||"",
            power:c.dataset.power||"",
            x:tileX,
            y:tileY
        })

    })

    localStorage.setItem("kingshotLayout",JSON.stringify(layout))

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

    let layout=JSON.parse(data)

    document.querySelectorAll(".castle,.banner").forEach(c=>c.remove())

    layout.forEach(c=>{

        if(c.type==="castle") createCastle(c.x*grid,c.y*grid,c.name,c.power)
        if(c.type==="banner") createBanner(c.x*grid,c.y*grid)

        if(c.type==="trap"){

            let offset = trapOffset()

            if(!trap1.dataset.used){
                trap1.style.left=c.x*grid+offset+"px"
                trap1.style.top=c.y*grid+offset+"px"
                trap1.dataset.used=true
            }else{
                trap2.style.left=c.x*grid+offset+"px"
                trap2.style.top=c.y*grid+offset+"px"
            }

        }

    })

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

    let reader=new FileReader()

    reader.onload=function(e){

        localStorage.setItem(
            "kingshotLayout",
            e.target.result
        )

        loadLayout()

    }

    reader.readAsText(file)

}

/* =========================================================
   INITIALIZATION
========================================================= */

loadLayout()