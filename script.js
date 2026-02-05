/* script.js */
let stageSch, stagePcb, layerSch, layerPcb;
let selectedId = null;
let lastPointerPos = { x: 60, y: 60 };
const GRID_SIZE = 20;

let wires = []; 
let connectionSource = null; 
let tempLine = null;
let counters = { Resistor: 0, Capacitor: 0, Transistor: 0, Inductor: 0 };

function drawGrid(layer) {
    const group = new Konva.Group({ listening: false });
    for (let i = 0; i <= 4000 / GRID_SIZE; i++) {
        group.add(new Konva.Line({ points: [i * GRID_SIZE, 0, i * GRID_SIZE, 4000], stroke: '#222', strokeWidth: 1 }));
        group.add(new Konva.Line({ points: [0, i * GRID_SIZE, 4000, i * GRID_SIZE], stroke: '#222', strokeWidth: 1 }));
    }
    layer.add(group);
    group.moveToBottom();
}

function checkKonva() {
    const badge = document.getElementById('libStatus');
    if (typeof Konva !== 'undefined') {
        badge.innerText = "ENGINE: OK (v" + Konva.version + ")";
        badge.className = "status-badge ok";
        return true;
    }
    return false;
}

window.onload = function() {
    if (!checkKonva()) return;
    const schDiv = document.getElementById('schematic');
    const pcbDiv = document.getElementById('pcb');

    stageSch = new Konva.Stage({ container: 'schematic', width: schDiv.offsetWidth, height: schDiv.offsetHeight });
    stagePcb = new Konva.Stage({ container: 'pcb', width: pcbDiv.offsetWidth, height: pcbDiv.offsetHeight });

    layerSch = new Konva.Layer();
    layerPcb = new Konva.Layer();
    stageSch.add(layerSch);
    stagePcb.add(layerPcb);

    drawGrid(layerSch);
    drawGrid(layerPcb);

    stageSch.on('mousemove', () => {
        if (tempLine && connectionSource) {
            const pos = stageSch.getPointerPosition();
            const sPos = connectionSource.getAbsolutePosition();
            const transform = layerSch.getAbsoluteTransform().copy().invert();
            const p1 = transform.point(sPos);
            const p2 = transform.point(pos);
            tempLine.points([p1.x, p1.y, p1.x, p2.y, p2.x, p2.y]);
            layerSch.batchDraw();
        }
    });

    stageSch.on('mousedown', (e) => { if (e.target === stageSch && connectionSource) cancelConnection(); });

    schDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pos = stageSch.getPointerPosition();
        lastPointerPos = { x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE, y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE };
        const menu = document.getElementById('menu');
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
    });
    window.addEventListener('click', () => { document.getElementById('menu').style.display = 'none'; });
};

function cancelConnection() {
    if (connectionSource) connectionSource.fill(connectionSource.name() === 'mid-pin' ? '#00aa00' : 'yellow');
    if (tempLine) tempLine.destroy();
    connectionSource = null; tempLine = null; layerSch.draw();
}

function connectPins(sourcePin, targetPin) {
    const wireId = 'wire_' + Math.random().toString(36).substr(2, 5);
    
    // Линия провода
    const wireLine = new Konva.Line({
        stroke: '#00ff00',
        strokeWidth: 2,
        lineCap: 'round',
        lineJoin: 'round',
        points: [0, 0, 0, 0, 0, 0], // Будут обновлены в updateWires
        name: 'wire-line',
        id: wireId
    });

    // Узел для T-соединения
    const midPin = new Konva.Circle({ 
        radius: 5, 
        fill: '#005500',       // Темно-зеленый (в покое)
        stroke: '#00ff00', 
        strokeWidth: 1,
        name: 'mid-pin', 
        visible: true,        // ТЕПЕРЬ ВСЕГДА ВИДИМЫЙ
        opacity: 0.5,         // Но полупрозрачный, чтобы не рябило
        hitStrokeWidth: 20,   // Большая зона захвата
        id: wireId + '_pin' 
    });

    // Эффекты при наведении на точку (пин)
    midPin.on('mouseenter', () => {
        midPin.opacity(1);
        midPin.fill('#00ff00'); // Ярко-зеленый при наведении
        stageSch.container().style.cursor = 'pointer';
        layerSch.draw();
    });

    midPin.on('mouseleave', () => {
        midPin.opacity(0.5);
        midPin.fill('#005500');
        stageSch.container().style.cursor = 'crosshair';
        layerSch.draw();
    });

    // Эффект при наведении на сам провод
    wireLine.on('mouseenter', () => {
        wireLine.strokeWidth(4); // Утолщаем провод
        midPin.opacity(1);       // Проявляем узел
        layerSch.draw();
    });

    wireLine.on('mouseleave', () => {
        wireLine.strokeWidth(2);
        if (!connectionSource) midPin.opacity(0.5);
        layerSch.draw();
    });

    // Логика клика по узлу (как раньше)
    midPin.on('mousedown', (e) => {
        e.cancelBubble = true;
        if (!connectionSource) {
            connectionSource = midPin;
            midPin.fill('#00ffff'); // Бирюзовый в режиме ожидания связи
            midPin.opacity(1);
        } else {
            if (connectionSource !== midPin) connectPins(connectionSource, midPin);
            cancelConnection();
        }
        layerSch.draw();
    });

    const wireObj = { id: wireId, source: sourcePin, target: targetPin, line: wireLine, midPin: midPin };
    wires.push(wireObj);
    layerSch.add(wireLine, midPin);
    wireLine.moveToBottom();
    updateWires();
}


function updateWires() {
    wires.forEach(w => {
        const sPos = w.source.getAbsolutePosition();
        const tPos = w.target.getAbsolutePosition();
        const transform = layerSch.getAbsoluteTransform().copy().invert();
        const p1 = transform.point(sPos);
        const p2 = transform.point(tPos);
        const midX = p1.x; const midY = p2.y;
        w.line.points([p1.x, p1.y, midX, midY, p2.x, p2.y]);
        w.midPin.position({ x: midX, y: midY });
    });
    layerSch.batchDraw();
}

function selectComponent(id) {
    selectedId = id;
    stageSch.find('.comp-body').forEach(n => n.stroke('white'));
    stagePcb.find('.comp-body').forEach(n => n.stroke('white'));
    const schG = stageSch.findOne('#' + id);
    const pcbG = stagePcb.findOne('#' + id);
    if(schG) schG.find('.comp-body').forEach(n => n.stroke('#ffff00'));
    if(pcbG) pcbG.find('.comp-body').forEach(n => n.stroke('#ffff00'));
    layerSch.draw(); layerPcb.draw();
}

function reindexComponents() {
    const types = [{p:'R', t:'Resistor'}, {p:'C', t:'Capacitor'}, {p:'L', t:'Inductor'}, {p:'VT', t:'Transistor'}];
    types.forEach(typeObj => {
        let comps = stageSch.find(n => n.getType()==='Group' && n.id() && n.id().startsWith(typeObj.p));
        comps.sort((a, b) => a.x() - b.x());
        comps.forEach((g, i) => {
            const newId = typeObj.p + (i + 1);
            const oldId = g.id();
            g.id(newId);
            const t = g.findOne('Text'); if(t) t.text(newId);
            const p = stagePcb.findOne('#' + oldId); 
            if(p) { p.id(newId); const pt = p.findOne('Text'); if(pt) pt.text(newId); }
        });
        counters[typeObj.t] = comps.length;
    });
    layerSch.draw(); layerPcb.draw();
}

window.addEventListener('keydown', (e) => {
    if (!selectedId) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        wires = wires.filter(w => {
            const sComp = w.source.findAncestor('.comp-group') || w.source;
            const tComp = w.target.findAncestor('.comp-group') || w.target;
            if (sComp.id() === selectedId || tComp.id() === selectedId) {
                w.line.destroy(); w.midPin.destroy(); return false;
            }
            return true;
        });
        stageSch.findOne('#' + selectedId)?.destroy();
        stagePcb.findOne('#' + selectedId)?.destroy();
        selectedId = null;
        reindexComponents(); updateWires();
    }
    if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'к') {
        const schGroup = stageSch.findOne('#' + selectedId);
        if (schGroup && schGroup.name() === 'comp-group') {
            schGroup.rotation(schGroup.rotation() + 90);
            updateWires(); layerSch.draw();
        }
    }
});

function addComp(prefix, color, w_notused, h_notused, typeName, manualId = null) {
    let id = manualId || (prefix + (++counters[typeName]));
    const groupSch = new Konva.Group({ x: lastPointerPos.x, y: lastPointerPos.y, draggable: true, id: id, name: 'comp-group', dragBoundFunc: pos => ({ x: Math.round(pos.x/GRID_SIZE)*GRID_SIZE, y: Math.round(pos.y/GRID_SIZE)*GRID_SIZE }) });

    const createPin = (px, py, pinName = 'pin') => {
        const p = new Konva.Circle({ x: px, y: py, radius: 4, fill: 'yellow', name: pinName, stroke: '#555', strokeWidth: 1, hitStrokeWidth: 15 });
        p.on('mousedown', (e) => {
            e.cancelBubble = true;
            if (!connectionSource) {
                connectionSource = p; p.fill('#00ffff');
                tempLine = new Konva.Line({ stroke:'#00ff00', strokeWidth:1.5, dash: [5, 5], points: [0,0,0,0,0,0] });
                layerSch.add(tempLine);
            } else {
                if (connectionSource !== p) connectPins(connectionSource, p);
                cancelConnection();
            }
            layerSch.draw();
        });
        return p;
    };

    if (typeName === 'Resistor') {
        groupSch.add(new Konva.Rect({ x:-20, y:-10, name:'comp-body', width:40, height:20, fill:'#222', stroke:'white', strokeWidth:1.5 }));
        groupSch.add(new Konva.Line({ points:[-40,0,-20,0], stroke:'white' }));
        groupSch.add(new Konva.Line({ points: [20,0,40,0], stroke:'white' }));
        groupSch.add(createPin(-40, 0)); groupSch.add(createPin(40, 0));
    } else if (typeName === 'Capacitor') {
        groupSch.add(new Konva.Line({ name:'comp-body', points:[-5,-10,-5,10], stroke:'white', strokeWidth:2.5 }));
        groupSch.add(new Konva.Line({ name:'comp-body', points:[5,-10,5,10], stroke:'white', strokeWidth:2.5 }));
        groupSch.add(new Konva.Line({ points:[-20,0,-5,0], stroke:'white' }));
        groupSch.add(new Konva.Line({ points: [5,0,20,0], stroke:'white' }));
        groupSch.add(createPin(-20, 0)); groupSch.add(createPin(20, 0));
    } else if (typeName === 'Inductor') {
        for(let i=0; i<3; i++) { groupSch.add(new Konva.Arc({ name:'comp-body', x:-15+(i*15), y:0, innerRadius:7, outerRadius:7, angle:180, rotation:180, stroke:'white', strokeWidth:1.5 })); }
        groupSch.add(new Konva.Line({ points:[-30,0,-22,0], stroke:'white' }));
        groupSch.add(new Konva.Line({ points: [22,0,30,0], stroke:'white' }));
        groupSch.add(createPin(-30, 0)); groupSch.add(createPin(30, 0));
    } else if (typeName === 'Transistor') {
        groupSch.add(new Konva.Circle({ name:'comp-body', x:0, y:0, radius:20, stroke:'white', strokeWidth:1.5 }));
        groupSch.add(new Konva.Line({ points:[-5,-10,-5,10], stroke:'white', strokeWidth:2.5 }));
        groupSch.add(new Konva.Line({ points:[-20,0,-5,0], stroke:'white' }));
        groupSch.add(new Konva.Line({ points:[-5,-5,15,-15], stroke:'white' }));
        groupSch.add(new Konva.Line({ points:[-5,5,15,15], stroke:'white' }));
        groupSch.add(createPin(-20, 0)); groupSch.add(createPin(15, -15)); groupSch.add(createPin(15, 15));
        groupSch.add(new Konva.Text({ text:'Б', x:-22, y:8, fill:'#aaa', fontSize:10, listening: false }));
        groupSch.add(new Konva.Text({ text:'К', x:18, y:-25, fill:'#aaa', fontSize:10, listening: false }));
        groupSch.add(new Konva.Text({ text:'Э', x:18, y:18, fill:'#aaa', fontSize:10, listening: false }));
    }

    groupSch.add(new Konva.Text({ text: id, x:-10, y:-35, fill:'white', fontSize: 12, fontStyle:'bold' }));
    const groupPcb = new Konva.Group({ x: 60, y: 60, draggable: true, id: id, dragBoundFunc: pos => ({ x: Math.round(pos.x/GRID_SIZE)*GRID_SIZE, y: Math.round(pos.y/GRID_SIZE)*GRID_SIZE }) });
    groupPcb.add(new Konva.Rect({ name:'comp-body', width:40, height:20, fill:'#27ae60', stroke:'white', strokeWidth:1 }));
    groupPcb.add(new Konva.Text({ text: id, x:2, y:4, fill: 'white', fontSize:10, fontStyle:'bold' }));

    groupSch.on('dragmove', updateWires);
    groupSch.on('click', (e) => { e.cancelBubble=true; selectComponent(id); });
    groupPcb.on('click', (e) => { e.cancelBubble=true; selectComponent(id); });

    layerSch.add(groupSch); layerPcb.add(groupPcb);
    layerSch.draw(); layerPcb.draw();
}

function saveProject() {
    const data = { counters: counters, components: [], wires: [] };
    stageSch.find('.comp-group').forEach(g => {
        data.components.push({ id: g.id(), x: g.x(), y: g.y(), rotation: g.rotation(), type: g.id().replace(/[0-9]/g, '') });
    });
    wires.forEach(w => {
        const sNode = w.source.findAncestor('.comp-group') || w.source;
        const tNode = w.target.findAncestor('.comp-group') || w.target;
        data.wires.push({
            sourceId: sNode.id(),
            sourceIsWire: w.source.name() === 'mid-pin',
            sourcePinIdx: w.source.name() === 'mid-pin' ? 0 : sNode.find('.pin').indexOf(w.source),
            targetId: tNode.id(),
            targetIsWire: w.target.name() === 'mid-pin',
            targetPinIdx: w.target.name() === 'mid-pin' ? 0 : tNode.find('.pin').indexOf(w.target)
        });
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'project.json'; link.click();
}

function loadProject(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            wires.forEach(w => { w.line.destroy(); w.midPin.destroy(); }); wires = [];
            stageSch.find('.comp-group').forEach(c => c.destroy());
            stagePcb.find('.comp-group').forEach(c => c.destroy());
            counters = Object.assign({}, data.counters);
            data.components.forEach(c => {
                lastPointerPos = { x: c.x, y: c.y };
                let typeName = (c.type==='R'?'Resistor':c.type==='C'?'Capacitor':c.type==='L'?'Inductor':'Transistor');
                addComp(c.type, 'white', 0, 0, typeName, c.id);
                const g = stageSch.findOne('#' + c.id); if(g) g.rotation(c.rotation || 0);
            });
            layerSch.batchDraw();
            setTimeout(() => {
                data.wires.forEach(w => {
                    let sPin, tPin;
                    if (w.sourceIsWire) { sPin = stageSch.findOne('#' + w.sourceId + '_pin'); } 
                    else { const comp = stageSch.findOne('#' + w.sourceId); sPin = comp.find('.pin')[w.sourcePinIdx]; }
                    if (w.targetIsWire) { tPin = stageSch.findOne('#' + w.targetId + '_pin'); } 
                    else { const comp = stageSch.findOne('#' + w.targetId); tPin = comp.find('.pin')[w.targetPinIdx]; }
                    if (sPin && tPin) connectPins(sPin, tPin);
                });
                updateWires(); layerSch.draw();
            }, 100);
            event.target.value = '';
        } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
}
