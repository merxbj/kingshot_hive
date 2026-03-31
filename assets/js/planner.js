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
const centerTile = mapTiles / 2
const startTile = centerTile - Math.floor(trapSize / 2)

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

    for(let y = 0; y < mapTiles; y++){
        for(let x = 0; x < mapTiles; x++){

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

        if(!el.classList.contains("castle")) return

        editTarget = el

        document.getElementById("castleName").value = el.dataset.name
        document.getElementById("castlePower").value = el.dataset.power
        setTrap(el.dataset.trap || "F")

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

            const playersUI = document.querySelectorAll(".player")
            const castles = document.querySelectorAll(".castle")

            playersUI.forEach(e=>e.classList.remove("active"))
            castles.forEach(e=>e.classList.remove("active"))

            if(active) return

            el.classList.add("active")

            castles.forEach(c=>{
                if(c.dataset.name === p.name){
                    c.classList.add("active")
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

            castleDialogTitle.textContent = "Edit castle"
            castleAddBtn.textContent = "Update"

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

        layout.push({
            type:c.classList.contains("trap")?"trap":
                c.classList.contains("banner")?"banner":
                    c.classList.contains("plainshq")?"plainshq":
                        "castle",
            name:c.dataset.name||"",
            power:c.dataset.power||"",
            trap:c.dataset.trap||"F",
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

    document.querySelectorAll(".castle,.banner,.plainshq").forEach(c=>c.remove())

    layout.forEach(c=>{

        if(c.type==="castle")
            createCastle(c.x*grid, c.y*grid, c.name, c.power, c.trap, true)
        if(c.type==="banner") createBanner(c.x*grid,c.y*grid)
        if(c.type==="plainshq") createPlainsHQ(c.x*grid,c.y*grid)

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
    updatePlayerList()
    applyCastleLevels()
}

function clearLayout(){

    // adds empty layout to storage
    localStorage.setItem("kingshotLayout",JSON.stringify([]))

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