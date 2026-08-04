(function () {
  "use strict";

  var coins = 320;
  var selectedNodeId = "airplane";
  var slogans = [
    '从<span>量子微光</span>，搭到万里星河',
    '拆开万物，看见<span>宇宙的搭建方法</span>',
    '每一次点亮，都是<span>世界的新一层</span>',
    '从一个电子，走向<span>整个宇宙</span>',
    '万物有来路，也会通向<span>更大的世界</span>'
  ];

  var layers = [
    { name: "星系与宇宙", y: 30 },
    { name: "星球与地貌", y: 155 },
    { name: "工程与造物", y: 375 },
    { name: "宏观物质", y: 590 },
    { name: "分子与材料", y: 790 },
    { name: "原子世界", y: 995 },
    { name: "粒子与量子", y: 1165 }
  ];

  var nodes = {
    galaxy: {
      name: "星系", symbol: "星", x: 50, y: 88, state: "unknown", quality: "legendary", cost: 64,
      description: "无数恒星、气体、尘埃和暗物质共同组成的巨大系统。",
      inputs: ["planet"], requirements: [{ id: "astronomy", amount: 1 }, { id: "space", amount: 1 }, { id: "longTime", amount: 1 }]
    },
    planet: {
      name: "星球", symbol: "球", x: 50, y: 220, state: "revealed", quality: "legendary",
      description: "物质在引力作用下聚集形成的巨大天体。",
      inputs: ["flood", "fjord", "yardang", "city"],
      requirements: [{ id: "astronomy", amount: 1 }, { id: "orbital", amount: 1 }, { id: "longTime", amount: 2 }, { id: "space", amount: 1 }]
    },
    flood: {
      name: "洪水", sprite: [33.333, 66.667], x: 16, y: 330, state: "revealed", quality: "epic",
      description: "大量水在较短时间内汇集并越过原有边界。",
      inputs: ["pond"],
      requirements: [{ id: "accumulate", amount: 2 }, { id: "storm", amount: 1 }, { id: "riverValley", amount: 1 }, { id: "waterCycle", amount: 1 }]
    },
    fjord: {
      name: "峡湾", sprite: [100, 66.667], x: 35, y: 330, state: "unknown", quality: "epic", cost: 38,
      description: "冰川侵蚀出的谷地在冰川退却后被海水进入。",
      inputs: ["ice", "rock"],
      requirements: [{ id: "longTime", amount: 1 }, { id: "glacier", amount: 1 }, { id: "coast", amount: 1 }, { id: "geology", amount: 1 }]
    },
    yardang: {
      name: "雅丹", sprite: [66.667, 66.667], x: 62, y: 330, state: "revealed", quality: "epic",
      description: "干旱地区的岩层和沉积物被长期风力塑造出的地貌。",
      inputs: ["sediment"],
      requirements: [{ id: "erode", amount: 1 }, { id: "wind", amount: 1 }, { id: "arid", amount: 1 }, { id: "geology", amount: 1 }]
    },
    city: {
      name: "智慧城市", symbol: "城", x: 84, y: 330, state: "unknown", quality: "legendary", cost: 52,
      description: "许多建筑、交通、能源、计算和人的活动组成的大系统。",
      inputs: ["airplane", "computer"],
      requirements: [{ id: "assemble", amount: 2 }, { id: "electricity", amount: 2 }, { id: "systems", amount: 1 }, { id: "networking", amount: 1 }]
    },
    airplane: {
      name: "飞机", sprite: [0, 100], x: 15, y: 510, state: "revealed", quality: "legendary",
      description: "利用机翼周围的空气流动产生升力，让飞行器离开地面。",
      inputs: ["metal"],
      requirements: [{ id: "assemble", amount: 1 }, { id: "atmosphere", amount: 1 }, { id: "fluid", amount: 1 }, { id: "aero", amount: 1 }]
    },
    film: {
      name: "电影", symbol: "影", x: 34, y: 510, state: "unknown", quality: "epic", cost: 34,
      description: "影像、声音、表演和叙事共同构成的时间艺术。",
      inputs: ["computer"],
      requirements: [{ id: "filmAction", amount: 1 }, { id: "cinema", amount: 1 }, { id: "storytelling", amount: 1 }, { id: "music", amount: 1 }]
    },
    computer: {
      name: "计算机", sprite: [33.333, 100], x: 54, y: 510, state: "revealed", quality: "legendary",
      description: "用电子电路按照指令处理信息的通用机器。",
      inputs: ["chip", "metal"],
      requirements: [{ id: "assemble", amount: 1 }, { id: "electricity", amount: 1 }, { id: "electronics", amount: 1 }, { id: "computerArch", amount: 1 }]
    },
    game: {
      name: "电子游戏", sprite: [66.667, 100], x: 73, y: 510, state: "unknown", quality: "epic", cost: 42,
      description: "程序、规则、图像、声音与互动共同构成的数字世界。",
      inputs: ["computer"],
      requirements: [{ id: "programAction", amount: 1 }, { id: "dataStructures", amount: 1 }, { id: "graphics", amount: 1 }, { id: "visualDesign", amount: 1 }]
    },
    ai: {
      name: "人工智能", sprite: [100, 100], x: 90, y: 510, state: "revealed", quality: "legendary",
      description: "让计算机从数据中寻找规律并完成复杂任务的方法集合。",
      inputs: ["computer"],
      requirements: [{ id: "compute", amount: 1 }, { id: "linearAlgebra", amount: 1 }, { id: "probability", amount: 1 }, { id: "machineLearning", amount: 1 }]
    },
    metal: {
      name: "金属材料", symbol: "金", x: 8, y: 700, state: "discovered", quality: "rare",
      description: "由金属元素或合金构成，常具有强度、导电性和可加工性。", inputs: [], requirements: []
    },
    pond: {
      name: "池塘", sprite: [0, 66.667], x: 23, y: 700, state: "discovered", quality: "rare",
      description: "较多液态水在低洼环境中聚集形成的小型水域。", inputs: ["liquidWater"], requirements: []
    },
    liquidWater: {
      name: "液态水", sprite: [0, 33.333], x: 38, y: 700, state: "discovered", quality: "rare",
      description: "大量水分子聚集后表现出的常见液体形态。", inputs: ["water"], requirements: []
    },
    ice: {
      name: "冰", sprite: [33.333, 33.333], x: 53, y: 700, state: "discovered", quality: "rare",
      description: "水在低温下形成的固态结构。", inputs: ["water"], requirements: []
    },
    rock: {
      name: "岩石", sprite: [66.667, 33.333], x: 68, y: 700, state: "discovered", quality: "rare",
      description: "由一种或多种矿物组成的天然固体集合。", inputs: [], requirements: []
    },
    sediment: {
      name: "沉积物", sprite: [100, 33.333], x: 81, y: 700, state: "discovered", quality: "rare",
      description: "被搬运并沉积下来的碎屑、矿物或生物残留。", inputs: ["rock"], requirements: []
    },
    chip: {
      name: "芯片", sprite: [33.333, 100], x: 93, y: 700, state: "discovered", quality: "epic",
      description: "在小块半导体材料上集成大量电子电路。", inputs: ["atom"], requirements: []
    },
    hydrogen: {
      name: "氢气", symbol: "H₂", x: 24, y: 890, state: "discovered", quality: "rare",
      description: "由两个氢原子组成的双原子分子。", inputs: ["atom"], requirements: []
    },
    water: {
      name: "水分子", sprite: [100, 0], x: 44, y: 890, state: "discovered", quality: "epic",
      description: "由两个氢原子和一个氧原子组成。", inputs: ["hydrogen", "oxygen"], requirements: []
    },
    oxygen: {
      name: "氧气", symbol: "O₂", x: 64, y: 890, state: "discovered", quality: "rare",
      description: "由两个氧原子组成，是常见的气体分子。", inputs: ["atom"], requirements: []
    },
    crystal: {
      name: "晶体结构", sprite: [33.333, 33.333], x: 83, y: 890, state: "revealed", quality: "epic",
      description: "微粒按照有规律的方式排列形成的结构。",
      inputs: ["atom"], requirements: [{ id: "cold", amount: 1 }, { id: "longTime", amount: 1 }, { id: "materials", amount: 1 }]
    },
    nucleus: {
      name: "原子核", sprite: [33.333, 0], x: 28, y: 1080, state: "discovered", quality: "rare",
      description: "位于原子中心，主要由质子和中子组成。", inputs: ["quantum"], requirements: []
    },
    atom: {
      name: "原子", sprite: [66.667, 0], x: 50, y: 1080, state: "discovered", quality: "epic",
      description: "保持一种元素化学性质的基本单位。", inputs: ["nucleus", "electron"], requirements: []
    },
    electron: {
      name: "电子", sprite: [0, 0], x: 72, y: 1080, state: "discovered", quality: "rare",
      description: "带负电的基本粒子，参与构成原子并影响化学变化。", inputs: ["quantum"], requirements: []
    },
    quantum: {
      name: "量子微光", symbol: "✦", x: 50, y: 1240, state: "discovered", quality: "legendary",
      description: "用于表达最小尺度世界的起点符文。", inputs: [], requirements: []
    }
  };

  function resource(name, glyph, category, description, value, cost, consumed) {
    var data = { name: name, glyph: glyph, category: category, description: description, cost: cost, consumed: consumed };
    if (category === "knowledge" || category === "environment") data.owned = Boolean(value);
    else data.quantity = Number(value);
    return data;
  }

  var resources = {
    accumulate: resource("积累", "叠", "action", "把许多小份聚成更大的体量。", 1, 18, true),
    ignite: resource("点燃", "燃", "action", "为一次变化提供启动能量。", 2, 12, true),
    assemble: resource("组装", "装", "action", "把多个部件按结构组合起来。", 0, 22, true),
    programAction: resource("编程", "码", "action", "把想法写成计算机可以执行的指令。", 0, 24, true),
    filmAction: resource("拍摄", "摄", "action", "记录连续的画面和声音。", 0, 20, true),
    erode: resource("侵蚀", "蚀", "action", "让风、水或冰缓慢改变地表。", 1, 18, true),
    mix: resource("混合", "混", "action", "让多种物质结合。", 2, 14, true),
    compute: resource("计算", "算", "action", "执行大量数字和逻辑运算。", 1, 26, true),

    electricity: resource("电能", "电", "condition", "为装置或变化提供电能。", 2, 18, true),
    heat: resource("高温", "热", "condition", "让系统获得更多热能。", 1, 16, true),
    cold: resource("低温", "冷", "condition", "让系统处于较低温度。", 1, 16, true),
    longTime: resource("漫长时间", "时", "condition", "让缓慢的变化持续发生。", 1, 20, true),
    wind: resource("持续风力", "风", "condition", "提供持续的空气流动和侵蚀力量。", 0, 18, true),
    storm: resource("持续暴雨", "雨", "condition", "在一段时间里带来大量降水。", 0, 24, true),
    pressure: resource("压力", "压", "condition", "对物质施加持续的挤压力。", 0, 18, true),
    light: resource("光照", "光", "condition", "提供可见光或其他电磁能量。", 1, 15, true),

    atmosphere: resource("大气环境", "空", "environment", "存在可以流动的空气，适合研究飞行。", true, 0, false),
    laboratory: resource("实验环境", "实", "environment", "适合安全观察和验证规律的虚拟场域。", false, 24, false),
    riverValley: resource("河谷环境", "谷", "environment", "为水流汇集和移动提供空间。", true, 0, false),
    arid: resource("干旱环境", "旱", "environment", "干燥且植被较少，风力作用更明显。", true, 0, false),
    coast: resource("海岸环境", "海", "environment", "陆地与海洋相接的环境。", true, 0, false),
    glacier: resource("冰川环境", "冰", "environment", "冰体会在重力作用下缓慢流动。", false, 26, false),
    factory: resource("制造环境", "厂", "environment", "适合加工和装配复杂造物。", true, 0, false),
    space: resource("太空环境", "宇", "environment", "接近真空并受到天体引力影响的环境。", false, 30, false),

    math: resource("数学基础", "数", "knowledge", "用数量、结构和关系描述问题。", true, 0, false),
    linearAlgebra: resource("线性代数", "线", "knowledge", "研究向量、矩阵和线性变化，是 AI 的重要基础。", false, 32, false),
    calculus: resource("微积分", "微", "knowledge", "研究变化率和连续累积。", false, 34, false),
    probability: resource("概率统计", "概", "knowledge", "描述不确定性并从数据中寻找规律。", false, 30, false),
    mechanics: resource("力学", "力", "knowledge", "研究物体怎样受力和运动。", true, 0, false),
    fluid: resource("流体力学", "流", "knowledge", "研究液体和气体怎样流动。", false, 30, false),
    aero: resource("空气动力学", "翼", "knowledge", "研究空气流动怎样产生升力和阻力。", false, 34, false),
    thermodynamics: resource("热力学", "焓", "knowledge", "研究热、功和能量怎样转移。", false, 30, false),
    electromagnetism: resource("电磁学", "磁", "knowledge", "研究电、磁和电磁波。", true, 0, false),
    chemistry: resource("化学反应", "化", "knowledge", "理解物质怎样重新组合并形成新物质。", false, 26, false),
    materials: resource("材料学", "材", "knowledge", "研究材料的结构、性质和用途。", true, 0, false),
    electronics: resource("电子学", "电", "knowledge", "研究电子器件和电路怎样工作。", true, 0, false),
    computerArch: resource("组成原理", "组", "knowledge", "理解处理器、存储器和输入输出怎样协作。", false, 32, false),
    dataStructures: resource("数据结构", "树", "knowledge", "用合适的结构组织和访问数据。", false, 30, false),
    algorithms: resource("算法", "法", "knowledge", "设计清楚、有效的解决问题步骤。", true, 0, false),
    programming: resource("程序设计", "程", "knowledge", "把规则和想法表达成可运行程序。", true, 0, false),
    operatingSystems: resource("操作系统", "系", "knowledge", "管理计算机硬件和程序运行。", false, 34, false),
    networking: resource("网络原理", "网", "knowledge", "让不同计算设备交换信息。", false, 30, false),
    graphics: resource("计算机图形学", "图", "knowledge", "让计算机生成和处理视觉画面。", false, 32, false),
    systems: resource("系统工程", "统", "knowledge", "让许多部分协同成为可靠的大系统。", false, 34, false),
    machineLearning: resource("机器学习", "学", "knowledge", "让计算机从数据中改进完成任务的方法。", false, 36, false),
    neuralNetworks: resource("神经网络", "神", "knowledge", "由许多计算单元连接而成的学习模型。", false, 36, false),
    waterCycle: resource("水循环", "水", "knowledge", "理解水在地表、大气和地下之间循环。", true, 0, false),
    geology: resource("地质学", "地", "knowledge", "研究岩石、地层和地貌怎样形成。", false, 28, false),
    biology: resource("生物学", "生", "knowledge", "研究生命的结构、活动和演化。", false, 28, false),
    ecology: resource("生态学", "态", "knowledge", "研究生命与环境之间的关系。", false, 28, false),
    visualDesign: resource("视觉设计", "视", "knowledge", "用形状、颜色和布局清楚表达信息。", true, 0, false),
    storytelling: resource("叙事", "事", "knowledge", "安排角色、事件和节奏，让故事成立。", false, 24, false),
    music: resource("音乐", "乐", "knowledge", "用节奏、旋律和音色组织声音。", false, 24, false),
    cinema: resource("电影语言", "镜", "knowledge", "用镜头、剪辑和声音表达故事。", false, 28, false),
    astronomy: resource("天文学", "天", "knowledge", "研究天体和宇宙中的现象。", false, 32, false),
    orbital: resource("轨道力学", "轨", "knowledge", "研究天体和飞行器在引力中的运动。", false, 34, false)
  };

  var edges = [];
  Object.keys(nodes).forEach(function (nodeId) {
    nodes[nodeId].inputs.forEach(function (inputId) { edges.push([inputId, nodeId]); });
  });

  var worldMap = document.getElementById("worldMap");
  var mapViewport = document.getElementById("mapViewport");
  var nodeLayer = document.getElementById("nodeLayer");
  var layerMarks = document.getElementById("layerMarks");
  var canvas = document.getElementById("connectionCanvas");
  var inspector = document.getElementById("nodeInspector");
  var needPanel = document.getElementById("needPanel");
  var coinCount = document.getElementById("coinCount");
  var discoveryCount = document.getElementById("discoveryCount");
  var hoverTooltip = document.getElementById("hoverTooltip");
  var successBurst = document.getElementById("successBurst");
  var liveRegion = document.getElementById("liveRegion");

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function resourceReady(requirement) {
    var item = resources[requirement.id];
    return item.category === "knowledge" || item.category === "environment"
      ? item.owned
      : item.quantity >= requirement.amount;
  }

  function inputsReady(node) {
    return node.inputs.every(function (id) { return nodes[id].state === "discovered"; });
  }

  function ancestorsOf(startId) {
    var result = new Set();
    function visit(id) {
      nodes[id].inputs.forEach(function (inputId) {
        if (!result.has(inputId)) { result.add(inputId); visit(inputId); }
      });
    }
    visit(startId);
    return result;
  }

  function descendantsOf(startId) {
    var result = new Set();
    function visit(id) {
      edges.forEach(function (edge) {
        if (edge[0] === id && !result.has(edge[1])) { result.add(edge[1]); visit(edge[1]); }
      });
    }
    visit(startId);
    return result;
  }

  function spriteStyle(node) {
    return node.sprite ? "--sprite-x:" + node.sprite[0] + "%;--sprite-y:" + node.sprite[1] + "%;" : "";
  }

  function renderLayers() {
    layerMarks.innerHTML = layers.map(function (layer) {
      return '<div class="layer-mark" style="top:' + layer.y + 'px"><span>' + escapeHtml(layer.name) + "</span></div>";
    }).join("");
  }

  function renderNodes() {
    nodeLayer.innerHTML = Object.keys(nodes).map(function (id) {
      var node = nodes[id];
      var unknown = node.state === "unknown";
      var art = unknown
        ? '<span class="rune-art is-symbol">?</span>'
        : node.sprite
          ? '<span class="rune-art" style="' + spriteStyle(node) + '"></span>'
          : '<span class="rune-art is-symbol">' + escapeHtml(node.symbol) + "</span>";
      return '<button class="rune-node is-' + node.state + '" type="button" data-node="' + id +
        '" data-quality="' + node.quality + '" style="left:' + node.x + "%;top:" + node.y +
        'px" aria-label="' + escapeHtml(unknown ? "未解锁符文" : node.name) + '">' +
        '<span class="rune-frame">' + art + '</span><span class="rune-label">' +
        escapeHtml(unknown ? "未知符文" : node.name) + '</span><span class="rune-state" aria-hidden="true">' +
        (node.state === "discovered" ? "✓" : "◇") + "</span></button>";
    }).join("");

    nodeLayer.querySelectorAll(".rune-node").forEach(function (button) {
      button.addEventListener("click", function () { selectNode(button.dataset.node, false); });
    });
    discoveryCount.textContent = String(Object.keys(nodes).filter(function (id) { return nodes[id].state === "discovered"; }).length);
  }

  function drawCurve(context, from, to, color, width, alpha) {
    var fromRect = from.getBoundingClientRect();
    var toRect = to.getBoundingClientRect();
    var mapRect = worldMap.getBoundingClientRect();
    var x1 = fromRect.left + fromRect.width / 2 - mapRect.left;
    var y1 = fromRect.top + 39 - mapRect.top;
    var x2 = toRect.left + toRect.width / 2 - mapRect.left;
    var y2 = toRect.top + 39 - mapRect.top;
    var middleY = (y1 + y2) / 2;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(x1, y1);
    context.bezierCurveTo(x1, middleY, x2, middleY, x2, y2);
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(x2, y2, Math.max(2, width), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawConnections(ancestors, descendants) {
    var ratio = window.devicePixelRatio || 1;
    var width = worldMap.clientWidth;
    var height = worldMap.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    edges.forEach(function (edge) {
      var from = nodeLayer.querySelector('[data-node="' + edge[0] + '"]');
      var to = nodeLayer.querySelector('[data-node="' + edge[1] + '"]');
      if (from && to) drawCurve(context, from, to, "#a4a8d7", 1.2, .18);
    });
    edges.forEach(function (edge) {
      var from = nodeLayer.querySelector('[data-node="' + edge[0] + '"]');
      var to = nodeLayer.querySelector('[data-node="' + edge[1] + '"]');
      if (!from || !to) return;
      var sourcePath = (ancestors.has(edge[0]) || edge[0] === selectedNodeId) &&
        (ancestors.has(edge[1]) || edge[1] === selectedNodeId);
      var futurePath = (descendants.has(edge[0]) || edge[0] === selectedNodeId) &&
        (descendants.has(edge[1]) || edge[1] === selectedNodeId);
      if (sourcePath) drawCurve(context, from, to, "#59e7ff", 4.2, .88);
      else if (futurePath) drawCurve(context, from, to, "#ffd166", 3.1, .62);
    });
  }

  function renderRelations() {
    var ancestors = ancestorsOf(selectedNodeId);
    var descendants = descendantsOf(selectedNodeId);
    nodeLayer.querySelectorAll(".rune-node").forEach(function (button) {
      var id = button.dataset.node;
      button.classList.toggle("is-selected", id === selectedNodeId);
      button.classList.toggle("is-source", ancestors.has(id));
      button.classList.toggle("is-future", descendants.has(id));
    });
    drawConnections(ancestors, descendants);
  }

  function renderInspector() {
    var node = nodes[selectedNodeId];
    var unknown = node.state === "unknown";
    var art = unknown
      ? '<div class="inspector-art is-symbol">?</div>'
      : node.sprite
        ? '<div class="inspector-art" style="' + spriteStyle(node) + '"></div>'
        : '<div class="inspector-art is-symbol">' + escapeHtml(node.symbol) + "</div>";
    var stateText = node.state === "discovered" ? "已点亮 · 永久可用" :
      node.state === "revealed" ? "线索已开 · 等待生成" : "尚未解锁";
    var ancestors = ancestorsOf(selectedNodeId);
    var descendants = descendantsOf(selectedNodeId);
    var quality = node.quality === "legendary" ? "传说符文" : node.quality === "epic" ? "稀有符文" : "基础符文";
    inspector.innerHTML = art + '<div class="inspector-copy"><span class="inspector-state">' +
      stateText + "</span><h2>" + escapeHtml(unknown ? "未知符文" : node.name) + "</h2><p>" +
      escapeHtml(unknown ? "解锁后会看到完整图像、名称、组成关系和必要条件。" : node.description) +
      '</p></div><div class="inspector-links"><span>组成来路 ' + ancestors.size +
      "</span><span>可去方向 " + descendants.size + "</span><span>" + quality + "</span></div>";
  }

  function requirementStatus(requirement) {
    var item = resources[requirement.id];
    if (item.category === "knowledge") return item.owned ? "永久掌握" : "尚未学习";
    if (item.category === "environment") return item.owned ? "环境已备" : "尚未准备";
    return item.quantity + " / " + requirement.amount;
  }

  function buyLabel(item) {
    if (item.category === "knowledge") return "学习 " + item.cost;
    if (item.category === "environment") return "准备 " + item.cost;
    return "购买 " + item.cost;
  }

  function renderNeedPanel() {
    var node = nodes[selectedNodeId];
    var unknown = node.state === "unknown";
    var inputs = node.inputs.map(function (id) {
      return "<b>" + escapeHtml(nodes[id].name) + (nodes[id].state === "discovered" ? " ✓" : " ◇") + "</b>";
    });
    var requirementHtml = "";
    if (!unknown) {
      requirementHtml = node.requirements.slice(0, 4).map(function (requirement) {
        var item = resources[requirement.id];
        var ready = resourceReady(requirement);
        return '<div class="requirement-card' + (ready ? "" : " is-missing") +
          '"><span class="requirement-icon">' + escapeHtml(item.glyph) + "</span><strong>" +
          escapeHtml(item.name) + "</strong><small>" + escapeHtml(requirementStatus(requirement)) + "</small>" +
          (ready ? "" : '<button class="quick-buy" type="button" data-quick-buy="' +
            requirement.id + '">' + escapeHtml(buyLabel(item)) + "</button>") + "</div>";
      }).join("");
    }

    var actionText = "";
    var actionKind = "";
    var disabled = false;
    if (unknown) { actionText = "✦ " + node.cost + " 解锁未知符文"; actionKind = "unlock"; }
    else if (node.state === "discovered") { actionText = "✓ 已经永久点亮"; disabled = true; }
    else if (!inputsReady(node)) { actionText = "先点亮上游符文"; disabled = true; }
    else if (node.requirements.some(function (r) { return !resourceReady(r); })) { actionText = "把缺少的资源补齐"; disabled = true; }
    else { actionText = "点亮 " + node.name; actionKind = "build"; }

    needPanel.innerHTML = '<div class="need-heading"><strong id="needTitle">当前生成需要</strong><span>最多展示 4 项</span></div>' +
      '<div class="input-summary">' + (unknown ? "解锁后显示组成与消耗" :
        inputs.length ? "上游：" + inputs.join(" + ") : "这是一个基础起点") + "</div>" +
      '<div class="requirement-grid">' + (unknown
        ? '<div class="requirement-card"><span class="requirement-icon">?</span><strong>未知</strong><small>等待解锁</small></div>'
        : requirementHtml || '<div class="requirement-card"><span class="requirement-icon">✓</span><strong>无需工具</strong><small>直接可用</small></div>') +
      '</div><button class="build-action" type="button" data-node-action="' + actionKind + '"' +
      (disabled ? " disabled" : "") + ">" + escapeHtml(actionText) + "</button>";

    needPanel.querySelectorAll("[data-quick-buy]").forEach(function (button) {
      button.addEventListener("click", function () { buyResource(button.dataset.quickBuy); });
    });
    needPanel.querySelector("[data-node-action]").addEventListener("click", function (event) {
      if (event.currentTarget.dataset.nodeAction === "unlock") unlockSelected();
      if (event.currentTarget.dataset.nodeAction === "build") buildSelected();
    });
  }

  function slotExtra(item) {
    if (item.category === "knowledge" || item.category === "environment") {
      return item.owned ? '<span class="slot-check">✓</span>' : '<span class="slot-lock">◆</span>';
    }
    return '<span class="slot-count">×' + item.quantity + "</span>";
  }

  function renderInventoryGroup(category, containerId) {
    var container = document.getElementById(containerId);
    var needed = new Set(nodes[selectedNodeId].state === "unknown" ? [] :
      nodes[selectedNodeId].requirements.map(function (requirement) { return requirement.id; }));
    container.innerHTML = Object.keys(resources).filter(function (id) {
      return resources[id].category === category;
    }).map(function (id) {
      var item = resources[id];
      var locked = (category === "knowledge" || category === "environment") && !item.owned;
      return '<button class="inventory-slot' + (category === "knowledge" ? " is-knowledge" : "") +
        (item.owned ? " is-owned" : "") + (locked ? " is-locked" : "") +
        (needed.has(id) ? " is-needed" : "") + '" type="button" data-resource="' + id +
        '" aria-label="' + escapeHtml(item.name) + '">' + escapeHtml(item.glyph) + slotExtra(item) + "</button>";
    }).join("");

    container.querySelectorAll("[data-resource]").forEach(function (button) {
      button.addEventListener("mouseenter", showTooltip);
      button.addEventListener("mousemove", moveTooltip);
      button.addEventListener("mouseleave", hideTooltip);
      button.addEventListener("focus", showTooltip);
      button.addEventListener("blur", hideTooltip);
    });
  }

  function renderInventory() {
    renderInventoryGroup("action", "actionSlots");
    renderInventoryGroup("condition", "conditionSlots");
    renderInventoryGroup("environment", "environmentSlots");
    renderInventoryGroup("knowledge", "knowledgeSlots");
  }

  function categoryName(category) {
    return category === "action" ? "动作" : category === "condition" ? "条件" :
      category === "environment" ? "环境" : "永久知识";
  }

  function itemState(item) {
    if (item.category === "knowledge") return item.owned ? "已掌握 · 永久保留" : "尚未学习 · " + item.cost + " 星币";
    if (item.category === "environment") return item.owned ? "环境已准备 · 不消耗" : "尚未准备 · " + item.cost + " 星币";
    return "拥有 ×" + item.quantity + (item.consumed ? " · 使用后消耗" : " · 不消耗");
  }

  function showTooltip(event) {
    var item = resources[event.currentTarget.dataset.resource];
    hoverTooltip.innerHTML = "<small>" + categoryName(item.category) + "</small><strong>" +
      escapeHtml(item.name) + "</strong><p>" + escapeHtml(item.description) + "</p><b>" +
      escapeHtml(itemState(item)) + "</b>";
    hoverTooltip.classList.add("is-visible");
    positionTooltip(event);
  }

  function moveTooltip(event) { positionTooltip(event); }
  function hideTooltip() { hoverTooltip.classList.remove("is-visible"); }
  function positionTooltip(event) {
    var rect = event.currentTarget.getBoundingClientRect();
    var x = event.clientX || rect.left;
    var y = event.clientY || rect.top;
    hoverTooltip.style.left = Math.min(window.innerWidth - 242, Math.max(12, x - 248)) + "px";
    hoverTooltip.style.top = Math.min(window.innerHeight - 160, Math.max(12, y - 42)) + "px";
  }

  function announce(message) {
    liveRegion.textContent = "";
    window.setTimeout(function () { liveRegion.textContent = message; }, 20);
  }

  function buyResource(id) {
    var item = resources[id];
    if (!item) return;
    if ((item.category === "knowledge" || item.category === "environment") && item.owned) return;
    if (coins < item.cost) { announce("星币暂时不够，可以通过后续学习任务继续获得。"); return; }
    coins -= item.cost;
    if (item.category === "knowledge" || item.category === "environment") item.owned = true;
    else item.quantity += 1;
    coinCount.textContent = String(coins);
    renderNeedPanel();
    renderInventory();
    announce(item.category === "knowledge"
      ? "已经学会“" + item.name + "”，以后不需要重复购买。"
      : "已经准备好“" + item.name + "”。");
  }

  function unlockSelected() {
    var node = nodes[selectedNodeId];
    if (node.state !== "unknown") return;
    if (coins < node.cost) { announce("星币暂时不够，可以先探索已经打开的符文。"); return; }
    coins -= node.cost;
    node.state = "revealed";
    coinCount.textContent = String(coins);
    renderNodes();
    renderSelected();
    announce("解锁了“" + node.name + "”的图像、来路和生成条件。");
  }

  function buildSelected() {
    var node = nodes[selectedNodeId];
    if (node.state !== "revealed" || !inputsReady(node) ||
      node.requirements.some(function (r) { return !resourceReady(r); })) return;
    node.requirements.forEach(function (requirement) {
      var item = resources[requirement.id];
      if (item.category === "action" || item.category === "condition") item.quantity -= requirement.amount;
    });
    node.state = "discovered";
    renderNodes();
    renderSelected();
    successBurst.classList.remove("is-playing");
    void successBurst.offsetWidth;
    successBurst.classList.add("is-playing");
    announce(node.name + "已经永久点亮，也能继续成为更高层符文的来路。");
  }

  function renderSelected() {
    renderRelations();
    renderInspector();
    renderNeedPanel();
    renderInventory();
  }

  function selectNode(id, shouldCenter) {
    if (!nodes[id]) return;
    selectedNodeId = id;
    renderSelected();
    if (shouldCenter) {
      var element = nodeLayer.querySelector('[data-node="' + id + '"]');
      if (element) {
        var viewportRect = mapViewport.getBoundingClientRect();
        var elementRect = element.getBoundingClientRect();
        var top = mapViewport.scrollTop + elementRect.top - viewportRect.top - viewportRect.height * .52;
        mapViewport.scrollTo({ top: Math.max(0, top), behavior:
          window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }
  }

  document.getElementById("slogan").innerHTML = slogans[Math.floor(Math.random() * slogans.length)];
  document.querySelector(".back-button").addEventListener("click", function () {
    announce("这是独立临时原型，返回入口暂未接入正式应用。");
  });
  document.querySelector(".help-button").addEventListener("click", function () {
    announce("点击任意符文看三种关系亮度；右侧缺少资源可以直接购买或学习。");
  });
  window.addEventListener("resize", renderRelations);

  renderLayers();
  renderNodes();
  renderSelected();
  window.setTimeout(function () { selectNode("airplane", true); }, 90);
})();
