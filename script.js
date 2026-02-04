/* script.js */

let stageSch, stagePcb, layerSch, layerPcb;
let selectedId = null;
let lastPointerPos = { x: 50, y: 50 };

// Система соединений
let wires = []; 
let connectionSource = null; 
let tempLine = null; // Временная линия ("резиновая нить")

// Раздельные счетчики типов
let counters = {
    Resistor: 0,
    Capacitor: 0,
    Transistor: 0,
    Inductor: 0
};

// 1. ИНИЦИАЛИЗАЦИЯ
function checkKonva() {
    const badge = document.getElementById('libStatus');
    if (typeof Konva !== 'undefined') {
        badge.innerText = "ENGINE: OK (v" + Konva.version + ")";
        badge.classList.add('ok');
        return true;
    } else {
        badge.innerText = "ENGINE ERROR";
        badge.classList.add('error');
        document.getElementById('error-overlay').style.display = 'block';
        return false;
    }
}

window.onload = function() {
    if (!checkKonva()) return;

    stageSch = new Konva.Stage({
        container: 'schematic',
        width: document.getElementById('schematic').offsetWidth,
        height: document.getElementById('schematic').offsetHeight
    });

    stagePcb = new Konva.Stage({
        container: 'pcb',
        width: document.getElementById('pcb').offsetWidth,
        height: document.getElementById('pcb').offsetHeight
    });

    layerSch = new Konva.Layer();
    layerPcb = new Konva.Layer();
    stageSch.add(layerSch);
    stagePcb.add(layerPcb);

    // Обработка движения мыши для "резиновой нити"
    stageSch.on('mousemove', () => {
        if (tempLine && connectionSource) {
            const pos = stageSch.getPointerPosition();
            const sPos = connectionSource.getAbsolutePosition();
            const transform = layerSch.getAbsoluteTransform().copy().invert();
            const p1 = transform.point(sPos);
            const p2 = transform.point(pos);

            tempLine.points([p1.x, p1.y, p2.x, p2.y]);
            layerSch.batchDraw();
        }
    });

    // Отмена создания провода по клику на пустое место (ПКМ или ЛКМ)
    stageSch.on('mousedown', (e) => {
        if (e.target === stageSch && connectionSource) {
            cancelConnection();
        }
    });

    const menu = document.getElementById('menu');
    const schDiv = document.getElementById('schematic');

    schDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        lastPointerPos = stageSch.getPointerPosition();
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
    });

    window.addEventListener('click', () => menu.style.display = 'none');
};

// 2. ЛОГИКА ПРОВОДОВ
function cancelConnection() {
    if (connectionSource) connectionSource.fill('yellow');
    if (tempLine) tempLine.destroy();
    connectionSource = null;
    tempLine = null;
    layerSch.draw();
}

function connectPins(sourcePin, targetPin) {
    const wireLine = new Konva.Line({
        stroke: '#00ff00',
        strokeWidth: 2,
        lineCap: 'round',
        points: [0, 0, 0, 0]
    });

    const wireObj = {
        id: 'wire_' + Math.random().toString(36).substr(2, 5),
        source: sourcePin,
        target: targetPin,
        line: wireLine
    };

    wires.push(wireObj);
    layerSch.add(wireLine);
    wireLine.moveToBottom();
    updateWires();
}

function updateWires() {
    wires.forEach(w => {
        const s = w.source.getAbsolutePosition();
        const t = w.target.getAbsolutePosition();
        const transform = layerSch.getAbsoluteTransform().copy().invert();
        const p1 = transform.point(s);
        const p2 = transform.point(t);
        w.line.points([p1.x, p1.y, p2.x, p2.y]);
    });
    layerSch.batchDraw();
}

// 3. ВЫДЕЛЕНИЕ И УДАЛЕНИЕ
function selectComponent(id) {
    selectedId = id;
    stageSch.find('.comp-body').forEach(n => n.stroke('white'));
    stagePcb.find('.comp-body').forEach(n => n.stroke('white'));

    const schGroup = stageSch.findOne('#' + id);
    const pcbGroup = stagePcb.findOne('#' + id);
    if(schGroup) schGroup.find('.comp-body').forEach(n => n.stroke('#ffff00'));
    if(pcbGroup) pcbGroup.find('.comp-body').forEach(n => n.stroke('#ffff00'));
    layerSch.draw(); layerPcb.draw();
}

function reindexComponents() {
    const types = [
        { prefix: 'R', type: 'Resistor' },
        { prefix: 'C', type: 'Capacitor' },
        { prefix: 'L', type: 'Inductor' },
        { prefix: 'VT', type: 'Transistor' }
    ];
    types.forEach(t => {
        let comps = stageSch.find(node => node.getType() === 'Group' && node.id() && node.id().startsWith(t.prefix));
        comps.sort((a, b) => a.x() - b.x());
        comps.forEach((group, index) => {
            const newId = t.prefix + (index + 1);
            const oldId = group.id();
            group.id(newId);
            const txt = group.findOne('Text'); if (txt) txt.text(newId);
            const pcb = stagePcb.findOne('#' + oldId); 
            if (pcb) { pcb.id(newId); const ptxt = pcb.findOne('Text'); if (ptxt) ptxt.text(newId); }
        });
        counters[t.type] = comps.length;
    });
    layerSch.draw(); layerPcb.draw();
}

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        wires = wires.filter(w => {
            if (w.source.getAncestor().id() === selectedId || w.target.getAncestor().id() === selectedId) {
                w.line.destroy(); return false;
            }
            return true;
        });
        stageSch.findOne('#' + selectedId)?.destroy();
        stagePcb.findOne('#' + selectedId)?.destroy();
        selectedId = null;
        reindexComponents();
        updateWires();
    }
});

// 4. СОЗДАНИЕ КОМПОНЕНТА
function addComp(prefix, color, w, h, typeName) {
    counters[typeName]++;
    const id = prefix + counters[typeName];
    const groupSch = new Konva.Group({ x: lastPointerPos.x, y: lastPointerPos.y, draggable: true, id: id });

    const createPin = (px, py) => {
        const p = new Konva.Circle({ x: px, y: py, radius: 4, fill: 'yellow', name: 'pin', stroke: '#555', strokeWidth: 1 });
        p.on('mousedown', (e) => {
            e.cancelBubble = true;
            if (!connectionSource) {
                // Начало соединения
                connectionSource = p;
                p.fill('#00ffff');
                tempLine = new Konva.Line({
                    stroke: '#00ff00',
                    strokeWidth: 1.5,
                    dash: [5, 5], // Пунктир для временной линии
                    points: [0, 0, 0, 0]
                });
                layerSch.add(tempLine);
            } else {
                // Конец соединения
                if (connectionSource !== p) {
                    connectPins(connectionSource, p);
                }
                cancelConnection();
            }
            layerSch.draw();
        });
        return p;
    };

    if (typeName === 'Resistor') {
        groupSch.add(new Konva.Rect({ name: 'comp-body', width: 40, height: 16, fill: '#222', stroke: 'white', strokeWidth: 1.5 }));
        groupSch.add(new Konva.Line({ points: [-15, 8, 0, 8], stroke: 'white' }));
        groupSch.add(new Konva.Line({ points: [40, 8, 55, 8], stroke: 'white' }));
        groupSch.add(createPin(-15, 8)); groupSch.add(createPin(55, 8));
    } else if (typeName === 'Capacitor') {
        groupSch.add(new Konva.Line({ name: 'comp-body', points: [15, 0, 15, 20], stroke: 'white', strokeWidth: 2.5 }));
        groupSch.add(new Konva.Line({ name: 'comp-body', points: [25, 0, 25, 20], stroke: 'white', strokeWidth: 2.5 }));
        groupSch.add(new Konva.Line({ points: [0, 10, 15, 10], stroke: 'white' }));
        groupSch.add(new Konva.Line({ points: [25, 10, 40, 10], stroke: 'white' }));
        groupSch.add(createPin(0, 10)); groupSch.add(createPin(40, 10));
    } else if (typeName === 'Inductor') {
        for(let i=0; i<3; i++) {
            groupSch.add(new Konva.Arc({ name: 'comp-body', x: 7 + (i * 12), y: 10, innerRadius: 6, outerRadius: 6, angle: 180, rotation: 180, stroke: 'white', strokeWidth: 1.5 }));
        }
        groupSch.add(new Konva.Line({ points: [-10, 10, 1, 10], stroke: 'white' }));
        groupSch.add(new Konva.Line({ points: [37, 10, 47, 10], stroke: 'white' }));
        groupSch.add(createPin(-10, 10)); groupSch.add(createPin(47, 10));
    } else if (typeName === 'Transistor') {
        groupSch.add(new Konva.Circle({ name: 'comp-body', x: 20, y: 20, radius: 20, stroke: 'white', strokeWidth: 1.5 }));
        groupSch.add(new Konva.Line({ points: [10, 10, 10, 30], stroke: 'white', strokeWidth: 2 }));
        groupSch.add(new Konva.Line({ points: [-5, 20, 10, 20], stroke: 'white' }));
        groupSch.add(new Konva.Line({ points: [10, 15, 30, 5], stroke: 'white' }));
        groupSch.add(new Konva.Line({ points: [10, 25, 30, 35], stroke: 'white' }));
        groupSch.add(createPin(-5, 20)); groupSch.add(createPin(30, 5)); groupSch.add(createPin(30, 35));
        groupSch.add(new Konva.Text({ text: 'Б', x: -5, y: 26, fill: '#aaa', fontSize: 9 }));
        groupSch.add(new Konva.Text({ text: 'К', x: 32, y: -5, fill: '#aaa', fontSize: 9 }));
        groupSch.add(new Konva.Text({ text: 'Э', x: 32, y: 38, fill: '#aaa', fontSize: 9 }));
    }

    groupSch.add(new Konva.Text({ text: id, y: -25, fill: 'white', fontSize: 12, fontStyle: 'bold' }));

    const groupPcb = new Konva.Group({
        x: 50 + (counters[typeName] * 10), 
        y: 50 + (Object.keys(counters).indexOf(typeName) * 45), 
        draggable: true, id: id 
    });
    groupPcb.add(new Konva.Rect({ name: 'comp-body', width: 40, height: 20, fill: '#27ae60', stroke: 'white', strokeWidth: 1 }));
    groupPcb.add(new Konva.Text({ text: id, x: 2, y: 4, fill: 'white', fontSize: 10, fontStyle: 'bold' }));

    groupSch.on('dragmove', updateWires);
    groupSch.on('click', (e) => { e.cancelBubble = true; selectComponent(id); });
    groupPcb.on('click', (e) => { e.cancelBubble = true; selectComponent(id); });

    layerSch.add(groupSch); layerPcb.add(groupPcb);
    layerSch.draw(); layerPcb.draw();
}

window.onresize = () => {
    if (stageSch) {
        stageSch.width(document.getElementById('schematic').offsetWidth);
        stagePcb.width(document.getElementById('pcb').offsetWidth);
        updateWires();
    }
};
