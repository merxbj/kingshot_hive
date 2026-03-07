<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Kingshot Planner</title>

    <style>

        body{
            background:#1b1b1b;
            color:white;
            font-family:Arial;
            text-align:center;
        }

        #map{
            width:1600px;
            height:1000px;
            margin:auto;
            position:relative;

            background:
                    linear-gradient(#333 1px, transparent 1px),
                    linear-gradient(90deg,#333 1px, transparent 1px);

            background-size:40px 40px;
            border-right:1px solid #333;
            border-bottom:1px solid #333;
        }
        .castle{
            width:60px;
            height:60px;
            background:orange;
            border-radius:6px;
            position:absolute;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            text-align:center;
        }
        .castle-name{
            font-size:11px;
            line-height:10px;
        }
        .castle-power{
            font-size:14px;
            font-weight:bold;
            color:#111;
            margin-top: 6px;
        }
        .trap{
            width:120px;
            height:120px;
            background:red;
            border-radius:10px;
            position:absolute;

            display:flex;
            align-items:center;
            justify-content:center;
        }

        .castle, .trap{
            cursor:grab;
            user-select:none;
        }
        .castle:active,
        .trap:active{
            cursor:grabbing;
        }

        .dragging{
            opacity:0.7;
        }

        .banner{
            width:40px;
            height:40px;
            background:#2ecc71;
            border-radius:4px;
            position:absolute;
            cursor:grab;

            display:flex;
            align-items:center;
            justify-content:center;

            font-size:10px;
        }
    </style>
</head>

<body>

<h2>Kingshot Bear Trap Layout</h2>

<button onclick="addCastle()">Add castle</button>
<button onclick="createBanner(200,200)">Add banner</button>
<button onclick="saveLayout()">Save layout</button>
<button onclick="loadLayout()">Load layout</button>
<button onclick="exportLayout()">Export JSON</button>

<input type="file" id="importFile">

<button onclick="
importLayout(document.getElementById('importFile').files[0])
">
    Import JSON
</button>
<div id="map">

    <div id="trap1" class="trap">Trap 1</div>
    <div id="trap2" class="trap">Trap 2</div>

</div>

<script>

    const grid=40
    const castleSize=2
    const trapSize=3

    let map=document.getElementById("map")
    let selected=null
    let offsetX=0
    let offsetY=0
    let id=1

    // trap in midden
    let trap1=document.getElementById("trap1")
    let trap2=document.getElementById("trap2")

    makeDraggable(trap1)
    makeDraggable(trap2)

    const mapTiles = 30

    let centerTile = mapTiles / 2
    let startTile = centerTile - Math.floor(trapSize / 2)

    trap1.style.left = startTile * grid + "px"
    trap1.style.top = startTile * grid + "px"

    trap2.style.left = (startTile+6) * grid + "px"
    trap2.style.top = startTile * grid + "px"


    function createCastle(x=0,y=0,name="",power="0M"){

        let c=document.createElement("div")
        c.dataset.power = power
        c.className="castle"

        if(!name){
            name="Castle "+id
        }

        c.innerHTML = `
        <div class="castle-name">${name}</div>
        <div class="castle-power">${power}</div>
        `

        c.dataset.name=name
        c.dataset.id=id

        map.appendChild(c)

        let offset = (grid*castleSize - c.offsetWidth) / 2

        c.style.left = x + offset + "px"
        c.style.top = y + offset + "px"

        makeDraggable(c)

        id++

    }


    function addCastle(){

        let name=prompt("Naam van het kasteel / speler")
        if(!name) return

        let power=prompt("Power (bv 10M of 25M)")
        if(!power) power="0M"

        createCastle(100,100,name,power)

    }


    function makeDraggable(el){

        el.addEventListener("mousedown",(e)=>{

            selected=el
            offsetX=e.offsetX
            offsetY=e.offsetY

            selected.classList.add("dragging")

        })

        el.addEventListener("contextmenu",(e)=>{

            e.preventDefault()

            if(el.classList.contains("castle") || el.classList.contains("banner")){
                let type = el.classList.contains("banner") ? "Banner" : "Kasteel"

                if(confirm(type+" verwijderen?")){
                }
            }

        })

        el.addEventListener("dblclick",(e)=>{

            if(!el.classList.contains("castle")) return

            let power=prompt("Nieuwe power",el.dataset.power)

            if(power){
                el.dataset.power=power
                el.innerHTML = `
                <div class="castle-name">${el.dataset.name}</div>
                <div class="castle-power">${power}</div>
                `
            }

        })

    }


    document.addEventListener("mousemove",(e)=>{

        if(!selected) return

        let rect=map.getBoundingClientRect()

        let x=e.clientX-rect.left-offsetX
        let y=e.clientY-rect.top-offsetY

        selected.style.left = x + "px"
        selected.style.top = y + "px"

    })


    document.addEventListener("mouseup",()=>{

        if(!selected) return

        let x=parseInt(selected.style.left)
        let y=parseInt(selected.style.top)

        x=Math.round(x/grid)*grid
        y=Math.round(y/grid)*grid

        let size

        if(selected.classList.contains("trap")) size = trapSize
        else if(selected.classList.contains("banner")) size = 1
        else size = castleSize
        let offset = (grid*size - selected.offsetWidth) / 2

        selected.style.left = x + offset + "px"
        selected.style.top = y + offset + "px"

        selected.classList.remove("dragging")   // eerst class weg
        selected = null                         // daarna pas reset

    })

    function saveLayout(){

        let layout=[]

        document.querySelectorAll(".castle, .banner, .trap").forEach(c=>{

            let size

            if(c.classList.contains("trap")) size = trapSize
            else if(c.classList.contains("banner")) size = 1
            else size = castleSize

            let offset = (grid*size - c.offsetWidth)/2

            let tileX = Math.round((parseInt(c.style.left)-offset)/grid)
            let tileY = Math.round((parseInt(c.style.top)-offset)/grid)

            layout.push({
                type: c.classList.contains("trap") ? "trap" :
                    c.classList.contains("banner") ? "banner" :
                        "castle",
                name: c.dataset.name || "",
                power: c.dataset.power || "",
                x:tileX,
                y:tileY
            })

        })

        localStorage.setItem("kingshotLayout",JSON.stringify(layout))

    }

    function loadLayout(){

        let data=localStorage.getItem("kingshotLayout")

        if(!data) return

        delete trap1.dataset.used
        delete trap2.dataset.used

        let layout=JSON.parse(data)

        document.querySelectorAll(".castle, .banner").forEach(c=>c.remove())

        layout.forEach(c=>{

            if(c.type==="castle"){
                createCastle(c.x*grid,c.y*grid,c.name,c.power)
            }

            if(c.type==="banner"){
                createBanner(c.x*grid,c.y*grid)
            }

            if(c.type==="trap"){

                let trap = document.getElementById("trap1")

                if(!trap.dataset.used){
                    trap.style.left = c.x*grid+"px"
                    trap.style.top = c.y*grid+"px"
                    trap.dataset.used=true
                }else{
                    trap2.style.left = c.x*grid+"px"
                    trap2.style.top = c.y*grid+"px"
                }

            }

        })

    }

    function exportLayout(){

        let layout=[]

        document.querySelectorAll(".castle, .banner, .trap").forEach(c=>{

            let size

            if(c.classList.contains("trap")) size = trapSize
            else if(c.classList.contains("banner")) size = 1
            else size = castleSize

            let offset = (grid*size - c.offsetWidth)/2

            let tileX = Math.round((parseInt(c.style.left)-offset)/grid)
            let tileY = Math.round((parseInt(c.style.top)-offset)/grid)

            layout.push({
                type: c.classList.contains("trap") ? "trap" :
                    c.classList.contains("banner") ? "banner" :
                        "castle",
                name: c.dataset.name || "",
                power: c.dataset.power || "",
                x:tileX,
                y:tileY
            })

        })

        let json = JSON.stringify(layout,null,2)

        let blob = new Blob([json], {type:"application/json"})
        let url = URL.createObjectURL(blob)

        let a = document.createElement("a")
        a.href = url
        a.download = "kingshot_layout.json"
        a.click()

    }

    function importLayout(file){

        let reader = new FileReader()

        reader.onload = function(e){

            let layout = JSON.parse(e.target.result)

            document.querySelectorAll(".castle, .banner").forEach(c=>c.remove())

            layout.forEach(c=>{

                if(c.type==="castle"){
                    createCastle(c.x*grid,c.y*grid,c.name,c.power)
                }

                if(c.type==="banner"){
                    createBanner(c.x*grid,c.y*grid)
                }

                if(c.type==="trap"){

                    if(!trap1.dataset.used){
                        trap1.style.left = c.x*grid+"px"
                        trap1.style.top = c.y*grid+"px"
                        trap1.dataset.used=true
                    }else{
                        trap2.style.left = c.x*grid+"px"
                        trap2.style.top = c.y*grid+"px"
                    }

                }

            })

        }

        reader.readAsText(file)

    }

    document.querySelectorAll(".dragging").forEach(e=>{
        e.classList.remove("dragging")
    })

    function createBanner(x=0,y=0){

        let b=document.createElement("div")

        b.className="banner"

        map.appendChild(b)

        let offset = (grid - b.offsetWidth) / 2

        b.style.left = x + offset + "px"
        b.style.top = y + offset + "px"

        makeDraggable(b)

    }

    // start kastelen
    loadLayout()

</script>

</body>
</html>