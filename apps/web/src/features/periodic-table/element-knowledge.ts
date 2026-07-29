import { ELEMENTS } from "./elements.generated";

export type ElementRecord = (typeof ELEMENTS)[number];
export type CompoundRecord = {
  formula: string;
  name: string;
  note: string;
};

const USES: readonly (readonly string[])[] = [
  ["制造氨、甲醇和清洁燃料，也用于燃料电池与火箭推进剂。", "氢是恒星释放能量的重要原料，也是水和生命分子的组成部分。"],
  ["液氦能冷却核磁共振和粒子加速器的超导磁体，也用于气球和检漏。", "氦很轻又不易反应，适合保护精密设备。"],
  ["锂离子电池为手机和电动车储能；锂盐还用于玻璃陶瓷和部分药物。", "锂质量很轻，是重要的能源金属。"],
  ["铍铜合金坚硬且不易产生火花；铍还用于航天结构和 X 射线窗口。", "铍及其粉尘有毒，只能由专业人员安全处理。"],
  ["硼用于耐热玻璃、洗涤剂、半导体和控制核反应的中子吸收材料。", "硼纤维很强，含硼材料也常用于复合材料。"],
  ["碳构成所有已知生命；钢铁、燃料、石墨电极、钻石刀具和碳纤维都离不开它。", "同一种碳能形成柔软石墨、坚硬金刚石和许多纳米结构。"],
  ["氮是肥料和氨的原料；液氮用于快速冷冻，氮气可保护食品和电子制造过程。", "空气中约五分之四是氮气。"],
  ["氧支持呼吸和燃烧，用于医疗供氧、炼钢、焊接和水处理。", "氧也是水、岩石和人体中含量很高的元素。"],
  ["含氟材料用于牙膏、防粘涂层、制冷剂和某些药物；氟化物需要控制用量。", "单质氟极活泼且危险，实际应用多使用稳定的含氟化合物。"],
  ["氖气通电会发出明亮的红橙色光，用于霓虹灯、指示灯和高压放电设备。", "氖很不活泼，在空气中含量很少。"],
  ["钠盐用于食物、玻璃、造纸和化工；液态钠还能传递热量。", "金属钠遇水反应剧烈，日常接触到的通常是稳定的钠盐。"],
  ["镁合金轻，适合汽车和航天部件；镁燃烧发出强白光，也用于焰火和照明弹。", "镁离子还是叶绿素和人体酶系统的重要成员。"],
  ["铝轻、耐腐蚀、易成形，广泛用于飞机、建筑、饮料罐、铝箔和输电线。", "回收铝比从矿石制铝节省大量能量。"],
  ["硅是芯片和太阳能电池的核心材料；二氧化硅构成沙子、玻璃和许多岩石。", "硅连接了电子技术与地球上最常见的矿物材料。"],
  ["磷酸盐是肥料的重要成分；磷还用于安全火柴、金属处理和生物分子。", "DNA、细胞膜和骨骼都含有磷。"],
  ["硫主要用于制造硫酸，也用于橡胶硫化、肥料、药品和杀菌剂。", "硫是蛋白质中某些氨基酸的组成元素。"],
  ["氯用于饮用水消毒、漂白剂、聚氯乙烯塑料和大量化工生产。", "氯气有毒，生活中常见的是食盐等氯化物。"],
  ["氩气用于焊接保护、灯泡和晶体生长，为高温金属隔开空气。", "氩是空气中含量最多的稀有气体。"],
  ["钾盐是重要肥料；钾离子帮助神经和肌肉工作，也用于玻璃与肥皂制造。", "金属钾极活泼，必须隔绝水和空气保存。"],
  ["钙化合物用于水泥、石灰、石膏和炼钢；钙还是骨骼、牙齿和细胞信号的重要元素。", "自然界中的钙常存在于石灰石和贝壳中。"],
  ["钪加入铝合金可获得轻而强的材料，也用于高亮度金属卤化物灯。", "钪较稀少，主要用于高性能和研究用途。"],
  ["钛合金强、轻、耐腐蚀，用于飞机、航天器、化工设备和人体植入物；二氧化钛是白色颜料。", "钛能在表面形成保护性氧化膜。"],
  ["钒用于增强钢材，也用于化工催化剂和钒液流电池。", "钒可呈现多种氧化态，因此化合物颜色丰富。"],
  ["铬让不锈钢耐腐蚀，也用于镀层、颜料和耐火材料。", "六价铬有强毒性，而金属铬和三价铬的性质不同。"],
  ["锰主要用于炼钢和电池；二氧化锰常见于干电池。", "少量锰是生命所需的微量元素。"],
  ["铁是钢铁工业的核心，也是血红蛋白运送氧的重要元素。", "建筑、车辆、机器和工具大量依赖铁合金。"],
  ["钴用于高温合金、永磁体、电池正极和蓝色颜料。", "维生素 B₁₂ 的中心含有钴。"],
  ["镍用于不锈钢、耐热合金、电镀、催化剂和多种充电电池。", "镍能提高合金的强度与耐腐蚀性。"],
  ["铜导电导热性能优良，用于电线、电机、电子产品、管道和铜合金。", "铜也是人体需要的微量元素，并具有一定抑菌作用。"],
  ["锌用于钢铁镀锌防锈、黄铜、电池和氧化锌制品。", "锌参与人体许多酶和免疫过程。"],
  ["镓用于 LED、激光器、高频芯片和太阳能电池；金属镓能在手心附近温度熔化。", "砷化镓和氮化镓是重要半导体。"],
  ["锗用于光纤、红外光学、半导体和高效太阳能电池。", "锗能透过部分红外线，适合热成像光学元件。"],
  ["砷化镓用于高速电子与光电器件；砷化合物曾用于木材防腐和农药，但毒性限制了应用。", "砷及许多砷化合物有毒。"],
  ["硒用于光电器件、玻璃着色、太阳能电池和某些整流器。", "硒是人体需要但过量会有害的微量元素。"],
  ["溴化合物用于阻燃剂、摄影材料和水处理；许多旧用途因环境影响而减少。", "溴是常温下呈液态的非金属元素。"],
  ["氪用于高性能照明、闪光灯和激光器，也可填充节能窗。", "氪是稀少且较不活泼的气体。"],
  ["铷用于研究、光电器件和某些高精度原子钟。", "铷非常活泼，遇水会迅速反应。"],
  ["锶盐让焰火呈鲜红色，也用于铁氧体磁体、特种玻璃和医学同位素。", "锶与钙化学性质相似。"],
  ["钇用于红色荧光材料、激光晶体、陶瓷和高温超导材料。", "钇常与稀土元素一起存在。"],
  ["锆合金用于核反应堆燃料包壳；氧化锆用于耐火陶瓷、牙科材料和仿钻饰品。", "锆耐腐蚀且吸收中子的能力较低。"],
  ["铌用于超导磁体、粒子加速器和高强度钢；少量铌能显著增强合金。", "铌钛是常用超导材料。"],
  ["钼用于耐高温钢、润滑材料和石油加工催化剂。", "钼也是某些生物酶需要的微量元素。"],
  ["锝-99m 是核医学成像中使用最广的示踪核素之一。", "锝没有稳定同位素，主要由人工获得。"],
  ["钌用于耐磨电接点、芯片电阻、合金和多种化学催化剂。", "少量钌能提高铂族合金的硬度。"],
  ["铑主要用于汽车尾气催化转化器，也用于耐腐蚀镀层和高温测温器件。", "铑稀少、反射率高且耐腐蚀。"],
  ["钯用于汽车催化剂、电子器件、氢纯化和有机合成催化。", "钯能吸收大量氢。"],
  ["银用于首饰、电子触点、太阳能电池、镜面和抗菌材料。", "银是导电性最高的金属。"],
  ["镉曾用于镍镉电池、颜料和镀层，也用于部分太阳能电池；因毒性已严格限制。", "镉及其化合物会在生物体内累积。"],
  ["铟锡氧化物是触摸屏和液晶屏的透明导电层；铟也用于焊料和半导体。", "铟柔软、熔点较低。"],
  ["锡用于焊料、镀锡食品罐、青铜和特种玻璃。", "锡表面耐腐蚀，适合保护钢板。"],
  ["锑用于阻燃材料、铅合金、半导体和某些电池。", "锑化合物需要避免不当接触。"],
  ["碲用于热电材料、太阳能电池、橡胶和改善金属合金性能。", "碲较稀少，常作为铜冶炼副产物获得。"],
  ["碘用于消毒、医学成像和甲状腺激素；加碘盐帮助预防缺碘。", "碘受热容易形成紫色蒸气。"],
  ["氙用于高亮灯、闪光灯、离子推进器和部分麻醉研究，也用于医学成像。", "氙虽是稀有气体，却能形成少量稳定化合物。"],
  ["铯原子钟定义精确时间；铯化合物还用于钻井液和光电器件。", "铯是非常活泼、熔点很低的金属。"],
  ["硫酸钡用于消化道 X 射线造影；钡化合物也用于钻井、陶瓷和绿色焰火。", "可溶性钡盐有毒，造影使用难溶的硫酸钡。"],
  ["镧用于相机镜头玻璃、电池电极、打火石合金和石油裂化催化剂。", "镧是镧系元素家族的开端。"],
  ["氧化铈用于抛光玻璃和汽车催化剂；铈合金用于打火石。", "铈是较丰富的镧系元素。"],
  ["镨用于强磁体、飞机合金、玻璃着色和特种陶瓷。", "镨化合物常呈绿色或黄绿色。"],
  ["钕铁硼磁体用于电机、耳机和风力发电机；钕也用于激光器和玻璃着色。", "钕磁体是常见的高强度永磁体。"],
  ["钷用于研究、微型核电池和测厚仪，实际应用受放射性与稀少性限制。", "钷没有稳定同位素。"],
  ["钐钴磁体耐高温；钐还用于反应堆控制和癌症疼痛治疗同位素。", "钐能吸收中子。"],
  ["铕是红色和蓝色荧光材料的重要激活剂，用于显示器、灯具和防伪标记。", "铕化合物能发出鲜明荧光。"],
  ["钆用于核磁共振对比剂、吸收中子和磁性材料。", "医用钆必须以稳定螯合物形式使用。"],
  ["铽用于绿色荧光材料、固态器件和会随磁场伸缩的特种合金。", "铽能帮助显示器产生明亮绿色。"],
  ["镝用于耐高温强磁体、激光器和反应堆控制材料。", "镝能改善钕磁体在高温下的性能。"],
  ["钬用于医用与工业激光器、磁性材料和光谱校准。", "钬具有很强的磁矩。"],
  ["铒掺杂光纤可放大通信信号，也用于激光器和粉红色玻璃。", "铒帮助长距离光纤通信。"],
  ["铥用于便携式 X 射线源、激光器和研究。", "铥是较稀少的镧系元素。"],
  ["镱用于光纤激光器、改良合金和高精度原子钟研究。", "镱能产生适合工业加工的激光。"],
  ["镥用于 PET 探测晶体、放射性药物和石油化工催化剂。", "镥是密度较大的镧系元素。"],
  ["铪用于核反应堆控制棒、耐高温合金和先进芯片中的高介电材料。", "铪很能吸收中子。"],
  ["钽用于手机电容器、耐腐蚀化工设备、医疗植入物和高温合金。", "钽在人体环境中较稳定。"],
  ["钨用于硬质合金刀具、高温部件、电极和配重。", "钨拥有所有金属中最高的熔点。"],
  ["铼用于喷气发动机高温合金和石油重整催化剂。", "铼非常稀少，却能显著提高高温合金性能。"],
  ["锇用于极耐磨合金和电子显微镜样品染色；四氧化锇有强毒性。", "锇是密度最高的元素之一。"],
  ["铱用于火花塞、坩埚、电极和高温耐腐蚀合金。", "铱对腐蚀极有抵抗力。"],
  ["铂用于汽车尾气催化、化工催化、首饰、燃料电池和抗癌药物。", "铂耐腐蚀且催化性能出色。"],
  ["金用于首饰、可靠电子接点、航天反射层和部分医疗材料。", "金延展性极好且不易腐蚀。"],
  ["汞曾用于温度计、灯具和开关；因毒性，许多用途已被更安全材料替代。", "汞是常温下呈液态的金属。"],
  ["铊用于特种光学玻璃、电子研究和医学同位素；铊及其化合物有剧毒。", "生活中必须避免接触铊。"],
  ["铅用于铅酸电池和辐射屏蔽；因神经毒性，油漆、汽油和管道中的使用已大幅限制。", "铅柔软、密度大。"],
  ["铋用于胃药、低熔点合金、化妆品颜料和无铅焊料。", "铋在重金属中相对低毒，但仍需规范使用。"],
  ["钋主要用于放射性研究，曾作为小型热源和静电消除源。", "钋放射性极强，不能接触。"],
  ["砹用于靶向 α 粒子癌症治疗研究。", "砹极其稀少且所有同位素都有放射性。"],
  ["氡可用于地质和环境研究，但室内氡是重要的放射性健康风险。", "应通过通风和检测降低氡暴露。"],
  ["钫只能用于原子结构和核物理研究。", "它极不稳定，自然界中任一时刻都只有极少量。"],
  ["镭曾用于发光涂料和放疗，如今主要用于受严格控制的研究与部分核医学。", "镭具有强放射性。"],
  ["锕-225 用于靶向 α 粒子治疗研究，其他用途主要是核科学研究。", "锕具有强放射性。"],
  ["钍被研究作为潜在核燃料，也曾用于煤气灯纱罩和高温合金。", "钍具有放射性。"],
  ["镤主要用于核化学和地球科学研究。", "镤稀少、有放射性且难处理。"],
  ["铀用于核燃料、地质年代测定和高密度配重；其化合物曾用于玻璃着色。", "铀具有放射性和重金属毒性。"],
  ["镎用于中子探测器、核科学和制备其他超铀元素。", "镎是第一个人工获得的超铀元素。"],
  ["钚用于核能与航天器放射性同位素电源，也用于严格管控的核研究。", "钚具有强放射性和毒性。"],
  ["镅-241 常见于电离式烟雾报警器，也用于测量和研究。", "设备中的镅被密封封装，不能自行拆卸。"],
  ["锔用于 α 粒子源、空间探测仪器和合成更重元素。", "锔会因放射性衰变自行发热。"],
  ["锫只用于合成更重元素和研究锕系化学。", "它只能以极少量人工制得。"],
  ["锎-252 是强中子源，用于反应堆启动、材料分析和部分癌症治疗。", "锎极昂贵且具有强放射性。"],
  ["锿只用于基础研究和制造更重元素。", "它最初在热核爆炸产物中被发现。"],
  ["镄只用于研究原子核和超重元素。", "可获得的镄原子数量极少。"],
  ["钔用于研究重元素的化学与核结构。", "它按原子级数量制备。"],
  ["锘只用于核物理和锕系化学研究。", "锘没有实际日常用途。"],
  ["铹只用于研究第七周期末端元素的原子结构。", "它寿命短、产量极低。"],
  ["𬬻只用于超重元素的化学和核物理研究。", "它的原子通常一次只产生少量。"],
  ["𬭊用于研究第五族超重元素的相对论效应和化学行为。", "它没有日常用途。"],
  ["𬭳用于研究超重元素能否表现出类似钨和钼的化学性质。", "它只能在实验室中短暂存在。"],
  ["𬭛用于超重原子核与第七族化学研究。", "目前没有实际用途。"],
  ["𬭶帮助科学家研究极重原子核和类似锇的挥发性氧化物。", "它的寿命很短。"],
  ["鿏只用于确认超重元素核结构和衰变链。", "已制得的原子数量极少。"],
  ["𫟼用于核物理和第十族超重元素性质研究。", "目前没有实际用途。"],
  ["𬬭用于第十一族超重元素与相对论化学研究。", "目前没有实际用途。"],
  ["鿔用于研究超重元素在强相对论效应下是否仍像汞。", "目前没有实际用途。"],
  ["鿭用于研究第十三族超重元素及其衰变链。", "目前没有实际用途。"],
  ["𫓧用于探索超重原子核稳定性和第十四族化学。", "目前没有实际用途。"],
  ["镆用于研究第十五族超重元素和核壳层结构。", "目前没有实际用途。"],
  ["𫟷用于研究第十六族超重元素的衰变与预测性质。", "目前没有实际用途。"],
  ["鿬用于研究超重卤素的核结构与预测化学。", "目前没有实际用途。"],
  ["鿫完成了第七周期，用于检验超重稀有气体的理论预测。", "目前没有实际用途。"],
] as const;

const COMPOUNDS: Partial<Record<number, readonly CompoundRecord[]>> = {
  1: [
    { formula: "H₂O", name: "水", note: "生命与地球水循环的基础物质" },
    { formula: "H₂O₂", name: "过氧化氢", note: "氧化剂和消毒剂" },
    { formula: "NH₃", name: "氨", note: "肥料与化工的重要原料" },
    { formula: "CH₄", name: "甲烷", note: "天然气的主要成分" },
    { formula: "HCl", name: "氯化氢", note: "溶于水形成盐酸" },
  ],
  2: [{ formula: "HeH⁺", name: "氦合氢离子", note: "可在特殊天体和实验条件下存在" }],
  3: [
    { formula: "Li₂CO₃", name: "碳酸锂", note: "玻璃陶瓷和药物原料" },
    { formula: "LiOH", name: "氢氧化锂", note: "电池与二氧化碳吸收材料" },
    { formula: "LiFePO₄", name: "磷酸铁锂", note: "常见电池正极材料" },
  ],
  4: [
    { formula: "BeO", name: "氧化铍", note: "导热陶瓷，粉尘有毒" },
    { formula: "BeCl₂", name: "氯化铍", note: "铍化学研究原料" },
  ],
  5: [
    { formula: "B₂O₃", name: "三氧化二硼", note: "硼硅玻璃原料" },
    { formula: "H₃BO₃", name: "硼酸", note: "弱酸与玻璃陶瓷原料" },
    { formula: "BN", name: "氮化硼", note: "耐高温绝缘或超硬材料" },
    { formula: "Na₂B₄O₇·10H₂O", name: "硼砂", note: "玻璃、助焊和清洁用途" },
  ],
  6: [
    { formula: "CO₂", name: "二氧化碳", note: "光合作用原料与温室气体" },
    { formula: "CO", name: "一氧化碳", note: "有毒气体，也是工业合成气成分" },
    { formula: "CaCO₃", name: "碳酸钙", note: "石灰石、贝壳和粉笔的主要成分" },
    { formula: "SiC", name: "碳化硅", note: "硬质磨料和功率半导体" },
  ],
  7: [
    { formula: "NH₃", name: "氨", note: "肥料工业的核心原料" },
    { formula: "HNO₃", name: "硝酸", note: "重要强酸和氧化剂" },
    { formula: "NO", name: "一氧化氮", note: "生物信号分子和大气痕量气体" },
    { formula: "NO₂", name: "二氧化氮", note: "棕红色有毒气体" },
  ],
  8: [
    { formula: "H₂O", name: "水", note: "最重要的含氧化合物" },
    { formula: "O₃", name: "臭氧", note: "高层大气中吸收紫外线" },
    { formula: "H₂O₂", name: "过氧化氢", note: "含过氧键的氧化剂" },
    { formula: "SiO₂", name: "二氧化硅", note: "石英和玻璃的主要成分" },
    { formula: "Fe₂O₃", name: "氧化铁", note: "铁锈和赤铁矿的重要成分" },
  ],
  9: [
    { formula: "HF", name: "氟化氢", note: "腐蚀性强，可刻蚀玻璃" },
    { formula: "NaF", name: "氟化钠", note: "受控用于防龋" },
    { formula: "CaF₂", name: "氟化钙", note: "萤石的主要成分" },
    { formula: "(C₂F₄)ₙ", name: "聚四氟乙烯", note: "耐化学腐蚀的防粘材料" },
  ],
  10: [{ formula: "NeH⁺", name: "氖合氢离子", note: "只在特殊条件下存在的离子" }],
  11: [
    { formula: "NaCl", name: "氯化钠", note: "食盐的主要成分" },
    { formula: "NaOH", name: "氢氧化钠", note: "重要强碱" },
    { formula: "NaHCO₃", name: "碳酸氢钠", note: "小苏打" },
    { formula: "Na₂CO₃", name: "碳酸钠", note: "纯碱，玻璃工业原料" },
    { formula: "NaNO₃", name: "硝酸钠", note: "肥料和化工原料" },
  ],
  12: [
    { formula: "MgO", name: "氧化镁", note: "耐火材料" },
    { formula: "Mg(OH)₂", name: "氢氧化镁", note: "阻燃与制酸剂原料" },
    { formula: "MgSO₄", name: "硫酸镁", note: "泻盐和农业镁肥" },
    { formula: "MgCl₂", name: "氯化镁", note: "制取金属镁的原料" },
  ],
  13: [
    { formula: "Al₂O₃", name: "氧化铝", note: "刚玉和耐磨陶瓷" },
    { formula: "AlCl₃", name: "氯化铝", note: "化工催化剂" },
    { formula: "Al(OH)₃", name: "氢氧化铝", note: "阻燃填料和药物原料" },
  ],
  14: [
    { formula: "SiO₂", name: "二氧化硅", note: "石英、沙子和玻璃的基础" },
    { formula: "SiC", name: "碳化硅", note: "磨料和宽禁带半导体" },
    { formula: "SiH₄", name: "硅烷", note: "芯片薄膜沉积原料" },
    { formula: "Na₂SiO₃", name: "硅酸钠", note: "水玻璃" },
  ],
  15: [
    { formula: "H₃PO₄", name: "磷酸", note: "肥料和食品化工原料" },
    { formula: "P₄O₁₀", name: "五氧化二磷", note: "强吸水性氧化物" },
    { formula: "Ca₃(PO₄)₂", name: "磷酸钙", note: "磷矿和骨骼矿物相关成分" },
  ],
  16: [
    { formula: "H₂SO₄", name: "硫酸", note: "用量巨大的基础化工原料" },
    { formula: "SO₂", name: "二氧化硫", note: "有刺激性，也用于制硫酸" },
    { formula: "H₂S", name: "硫化氢", note: "有臭鸡蛋气味的有毒气体" },
    { formula: "FeS₂", name: "二硫化铁", note: "黄铁矿" },
  ],
  17: [
    { formula: "NaCl", name: "氯化钠", note: "食盐与重要化工原料" },
    { formula: "HCl", name: "氯化氢", note: "水溶液是盐酸" },
    { formula: "NaClO", name: "次氯酸钠", note: "漂白和消毒成分" },
    { formula: "ClO₂", name: "二氧化氯", note: "水处理氧化剂" },
  ],
  18: [{ formula: "ArH⁺", name: "氩合氢离子", note: "仅在等离子体等特殊环境中存在" }],
  19: [
    { formula: "KCl", name: "氯化钾", note: "常见钾肥" },
    { formula: "KOH", name: "氢氧化钾", note: "强碱和电解液原料" },
    { formula: "KNO₃", name: "硝酸钾", note: "肥料和烟火原料" },
    { formula: "KMnO₄", name: "高锰酸钾", note: "紫色强氧化剂" },
  ],
  20: [
    { formula: "CaCO₃", name: "碳酸钙", note: "石灰石与贝壳的主要成分" },
    { formula: "CaO", name: "氧化钙", note: "生石灰" },
    { formula: "Ca(OH)₂", name: "氢氧化钙", note: "熟石灰" },
    { formula: "CaSO₄·2H₂O", name: "二水硫酸钙", note: "石膏" },
  ],
  21: [{ formula: "Sc₂O₃", name: "氧化钪", note: "特种陶瓷和灯具材料" }],
  22: [
    { formula: "TiO₂", name: "二氧化钛", note: "白色颜料和光催化材料" },
    { formula: "TiCl₄", name: "四氯化钛", note: "制取钛和二氧化钛的原料" },
    { formula: "TiN", name: "氮化钛", note: "金色耐磨涂层" },
  ],
  23: [
    { formula: "V₂O₅", name: "五氧化二钒", note: "制硫酸等反应的催化剂" },
    { formula: "VO₂", name: "二氧化钒", note: "具有温度驱动相变" },
  ],
  24: [
    { formula: "Cr₂O₃", name: "三氧化二铬", note: "绿色颜料和耐火材料" },
    { formula: "K₂Cr₂O₇", name: "重铬酸钾", note: "强氧化剂，六价铬有毒" },
  ],
  25: [
    { formula: "MnO₂", name: "二氧化锰", note: "干电池和催化剂材料" },
    { formula: "KMnO₄", name: "高锰酸钾", note: "紫色强氧化剂" },
  ],
  26: [
    { formula: "Fe₂O₃", name: "氧化铁", note: "赤铁矿和铁锈成分" },
    { formula: "Fe₃O₄", name: "四氧化三铁", note: "磁铁矿" },
    { formula: "FeSO₄", name: "硫酸亚铁", note: "水处理和补铁原料" },
    { formula: "FeS₂", name: "二硫化铁", note: "黄铁矿" },
  ],
  27: [
    { formula: "Co₃O₄", name: "四氧化三钴", note: "催化和电池材料" },
    { formula: "LiCoO₂", name: "钴酸锂", note: "锂离子电池正极材料" },
  ],
  28: [
    { formula: "NiO", name: "氧化镍", note: "陶瓷和电池材料" },
    { formula: "NiSO₄", name: "硫酸镍", note: "电镀和电池原料" },
    { formula: "Ni(CO)₄", name: "四羰基镍", note: "剧毒、易挥发的镍化合物" },
  ],
  29: [
    { formula: "CuO", name: "氧化铜", note: "黑色铜氧化物" },
    { formula: "Cu₂O", name: "氧化亚铜", note: "红色半导体材料" },
    { formula: "CuSO₄·5H₂O", name: "五水硫酸铜", note: "蓝矾或胆矾" },
    { formula: "Cu₂CO₃(OH)₂", name: "碱式碳酸铜", note: "孔雀石主要成分" },
  ],
  30: [
    { formula: "ZnO", name: "氧化锌", note: "橡胶、陶瓷和防晒材料" },
    { formula: "ZnS", name: "硫化锌", note: "发光材料和矿物成分" },
    { formula: "ZnSO₄", name: "硫酸锌", note: "农业和电镀原料" },
  ],
  31: [
    { formula: "GaAs", name: "砷化镓", note: "高速与光电半导体" },
    { formula: "GaN", name: "氮化镓", note: "LED 与功率半导体" },
    { formula: "Ga₂O₃", name: "氧化镓", note: "超宽禁带半导体" },
  ],
  32: [
    { formula: "GeO₂", name: "二氧化锗", note: "光纤和特种玻璃原料" },
    { formula: "GeH₄", name: "锗烷", note: "半导体沉积原料" },
  ],
  33: [
    { formula: "As₂O₃", name: "三氧化二砷", note: "有毒，也有严格医学用途" },
    { formula: "GaAs", name: "砷化镓", note: "重要化合物半导体" },
    { formula: "AsH₃", name: "砷化氢", note: "剧毒气体" },
  ],
  34: [
    { formula: "SeO₂", name: "二氧化硒", note: "有机合成和玻璃工业原料" },
    { formula: "CdSe", name: "硒化镉", note: "光电与量子点材料" },
  ],
  35: [
    { formula: "HBr", name: "溴化氢", note: "溶于水形成氢溴酸" },
    { formula: "AgBr", name: "溴化银", note: "传统感光材料" },
    { formula: "KBr", name: "溴化钾", note: "红外光谱窗片等用途" },
  ],
  36: [{ formula: "KrF₂", name: "二氟化氪", note: "少数已知的氪化合物之一" }],
  37: [
    { formula: "RbCl", name: "氯化铷", note: "研究与特种材料原料" },
    { formula: "RbOH", name: "氢氧化铷", note: "强碱，极易吸水" },
  ],
  38: [
    { formula: "SrCO₃", name: "碳酸锶", note: "磁体和烟火原料" },
    { formula: "SrSO₄", name: "硫酸锶", note: "天青石主要成分" },
    { formula: "SrTiO₃", name: "钛酸锶", note: "高介电陶瓷" },
  ],
  39: [
    { formula: "Y₂O₃", name: "氧化钇", note: "荧光和陶瓷材料" },
    { formula: "Y₃Al₅O₁₂", name: "钇铝石榴石", note: "YAG 激光和宝石材料" },
  ],
  40: [
    { formula: "ZrO₂", name: "二氧化锆", note: "耐火、牙科和结构陶瓷" },
    { formula: "ZrSiO₄", name: "硅酸锆", note: "锆石" },
    { formula: "ZrCl₄", name: "四氯化锆", note: "制取锆的中间体" },
  ],
  41: [
    { formula: "Nb₂O₅", name: "五氧化二铌", note: "光学玻璃和电容材料" },
    { formula: "NbN", name: "氮化铌", note: "超导薄膜材料" },
  ],
  42: [
    { formula: "MoS₂", name: "二硫化钼", note: "固体润滑和二维材料" },
    { formula: "MoO₃", name: "三氧化钼", note: "催化和功能材料" },
    { formula: "Na₂MoO₄", name: "钼酸钠", note: "缓蚀剂和微量肥料" },
  ],
  43: [
    { formula: "NaTcO₄", name: "高锝酸钠", note: "核医学制剂的化学形式之一" },
    { formula: "Tc₂O₇", name: "七氧化二锝", note: "挥发性锝氧化物" },
  ],
  44: [
    { formula: "RuO₂", name: "二氧化钌", note: "电极和电阻材料" },
    { formula: "RuCl₃", name: "三氯化钌", note: "催化剂前体" },
    { formula: "RuO₄", name: "四氧化钌", note: "强氧化且具有危险性" },
  ],
  45: [
    { formula: "RhCl₃", name: "三氯化铑", note: "催化剂前体" },
    { formula: "Rh₂O₃", name: "三氧化二铑", note: "铑氧化物" },
  ],
  46: [
    { formula: "PdCl₂", name: "氯化钯", note: "催化与镀层原料" },
    { formula: "PdO", name: "氧化钯", note: "催化材料" },
  ],
  47: [
    { formula: "AgNO₃", name: "硝酸银", note: "分析、感光和抗菌原料" },
    { formula: "AgCl", name: "氯化银", note: "白色感光固体" },
    { formula: "AgBr", name: "溴化银", note: "传统摄影感光材料" },
  ],
  48: [
    { formula: "CdS", name: "硫化镉", note: "黄色颜料和光电材料，含镉有毒" },
    { formula: "CdTe", name: "碲化镉", note: "薄膜太阳能材料" },
    { formula: "CdSe", name: "硒化镉", note: "量子点与光电材料" },
  ],
  49: [
    { formula: "In₂O₃", name: "氧化铟", note: "透明导电材料基础" },
    { formula: "InP", name: "磷化铟", note: "高速与光通信半导体" },
    { formula: "InAs", name: "砷化铟", note: "红外半导体" },
  ],
  50: [
    { formula: "SnO₂", name: "二氧化锡", note: "透明导电与气敏材料" },
    { formula: "SnCl₂", name: "氯化亚锡", note: "还原剂和镀锡原料" },
    { formula: "SnCl₄", name: "四氯化锡", note: "化工与薄膜原料" },
  ],
  51: [
    { formula: "Sb₂O₃", name: "三氧化二锑", note: "阻燃协效剂" },
    { formula: "Sb₂S₃", name: "三硫化二锑", note: "辉锑矿主要成分" },
  ],
  52: [
    { formula: "TeO₂", name: "二氧化碲", note: "特种玻璃材料" },
    { formula: "CdTe", name: "碲化镉", note: "太阳能电池材料" },
  ],
  53: [
    { formula: "KI", name: "碘化钾", note: "补碘和医学防护用途" },
    { formula: "AgI", name: "碘化银", note: "感光与人工影响天气研究" },
    { formula: "KIO₃", name: "碘酸钾", note: "食盐加碘的一种来源" },
  ],
  54: [
    { formula: "XeF₂", name: "二氟化氙", note: "蚀刻剂和含氙化合物" },
    { formula: "XeF₄", name: "四氟化氙", note: "平面正方形分子" },
    { formula: "XeF₆", name: "六氟化氙", note: "活泼的氙氟化物" },
    { formula: "XeO₃", name: "三氧化氙", note: "强氧化且有爆炸危险" },
  ],
  55: [
    { formula: "CsCl", name: "氯化铯", note: "密度梯度和晶体材料" },
    { formula: "CsI", name: "碘化铯", note: "辐射探测闪烁晶体" },
    { formula: "CsOH", name: "氢氧化铯", note: "极强碱" },
  ],
  56: [
    { formula: "BaSO₄", name: "硫酸钡", note: "难溶的 X 射线造影剂" },
    { formula: "BaCO₃", name: "碳酸钡", note: "陶瓷和玻璃原料" },
    { formula: "BaTiO₃", name: "钛酸钡", note: "重要铁电陶瓷" },
  ],
  57: [
    { formula: "La₂O₃", name: "氧化镧", note: "光学玻璃和陶瓷材料" },
    { formula: "LaNi₅", name: "镧镍合金", note: "储氢与电池材料" },
  ],
  58: [
    { formula: "CeO₂", name: "二氧化铈", note: "玻璃抛光和催化材料" },
    { formula: "CeCl₃", name: "三氯化铈", note: "化学合成与研究原料" },
  ],
  59: [
    { formula: "Pr₆O₁₁", name: "十一氧化六镨", note: "陶瓷与玻璃着色材料" },
    { formula: "PrCl₃", name: "三氯化镨", note: "镨化学原料" },
  ],
  60: [
    { formula: "Nd₂O₃", name: "氧化钕", note: "玻璃着色和磁体原料" },
    { formula: "Nd₂Fe₁₄B", name: "钕铁硼", note: "高强度永磁材料" },
  ],
  61: [
    { formula: "Pm₂O₃", name: "氧化钷", note: "仅用于受控放射化学研究" },
    { formula: "PmCl₃", name: "三氯化钷", note: "钷化学研究化合物" },
  ],
  62: [
    { formula: "Sm₂O₃", name: "氧化钐", note: "陶瓷与光学材料" },
    { formula: "SmCo₅", name: "钐钴合金", note: "耐高温永磁材料" },
  ],
  63: [
    { formula: "Eu₂O₃", name: "氧化铕", note: "荧光材料原料" },
    { formula: "EuS", name: "硫化铕", note: "磁性半导体研究材料" },
  ],
  64: [
    { formula: "Gd₂O₃", name: "氧化钆", note: "磁性与光学材料" },
    { formula: "Gd-DTPA", name: "钆喷酸葡胺类螯合物", note: "核磁共振对比剂家族代表" },
  ],
  65: [
    { formula: "Tb₄O₇", name: "七氧化四铽", note: "绿色荧光和磁性材料" },
    { formula: "TbCl₃", name: "三氯化铽", note: "铽化学研究原料" },
  ],
  66: [
    { formula: "Dy₂O₃", name: "氧化镝", note: "磁体与陶瓷材料" },
    { formula: "DyFe₂", name: "镝铁合金", note: "磁致伸缩材料" },
  ],
  67: [
    { formula: "Ho₂O₃", name: "氧化钬", note: "激光与玻璃着色材料" },
    { formula: "HoCl₃", name: "三氯化钬", note: "钬化学研究原料" },
  ],
  68: [
    { formula: "Er₂O₃", name: "氧化铒", note: "粉红色玻璃和光纤材料" },
    { formula: "ErCl₃", name: "三氯化铒", note: "铒掺杂材料原料" },
  ],
  69: [{ formula: "Tm₂O₃", name: "氧化铥", note: "激光与研究材料" }],
  70: [
    { formula: "Yb₂O₃", name: "氧化镱", note: "激光和陶瓷材料" },
    { formula: "YbCl₃", name: "三氯化镱", note: "有机合成催化研究" },
  ],
  71: [
    { formula: "Lu₂O₃", name: "氧化镥", note: "闪烁晶体和陶瓷材料" },
    { formula: "LuCl₃", name: "三氯化镥", note: "镥化学与同位素原料" },
  ],
  72: [
    { formula: "HfO₂", name: "二氧化铪", note: "先进芯片高介电层" },
    { formula: "HfC", name: "碳化铪", note: "极耐高温陶瓷" },
  ],
  73: [
    { formula: "Ta₂O₅", name: "五氧化二钽", note: "电容器介质和光学材料" },
    { formula: "TaC", name: "碳化钽", note: "超硬耐高温材料" },
  ],
  74: [
    { formula: "WO₃", name: "三氧化钨", note: "电致变色和催化材料" },
    { formula: "WC", name: "碳化钨", note: "硬质合金核心材料" },
    { formula: "Na₂WO₄", name: "钨酸钠", note: "钨化工原料" },
  ],
  75: [
    { formula: "Re₂O₇", name: "七氧化二铼", note: "高价铼氧化物" },
    { formula: "NH₄ReO₄", name: "高铼酸铵", note: "制取金属铼的重要原料" },
  ],
  76: [
    { formula: "OsO₄", name: "四氧化锇", note: "显微染色剂，挥发且剧毒" },
    { formula: "OsO₂", name: "二氧化锇", note: "导电氧化物" },
  ],
  77: [
    { formula: "IrO₂", name: "二氧化铱", note: "耐腐蚀电极催化材料" },
    { formula: "IrCl₃", name: "三氯化铱", note: "催化剂前体" },
  ],
  78: [
    { formula: "H₂PtCl₆", name: "氯铂酸", note: "制备铂催化剂的原料" },
    { formula: "Pt(NH₃)₂Cl₂", name: "顺铂", note: "重要抗癌药物" },
  ],
  79: [
    { formula: "HAuCl₄", name: "氯金酸", note: "镀金和纳米金原料" },
    { formula: "AuCl₃", name: "三氯化金", note: "金化学与催化研究" },
  ],
  80: [
    { formula: "HgS", name: "硫化汞", note: "辰砂主要成分，含汞有毒" },
    { formula: "HgCl₂", name: "氯化汞", note: "剧毒汞盐" },
    { formula: "Hg₂Cl₂", name: "氯化亚汞", note: "甘汞，仍有毒性" },
  ],
  81: [
    { formula: "Tl₂O", name: "氧化亚铊", note: "铊化学研究材料" },
    { formula: "Tl₂SO₄", name: "硫酸铊", note: "剧毒化合物" },
  ],
  82: [
    { formula: "PbO", name: "氧化铅", note: "玻璃与电池材料，含铅有毒" },
    { formula: "PbO₂", name: "二氧化铅", note: "铅酸电池正极材料" },
    { formula: "PbS", name: "硫化铅", note: "方铅矿主要成分" },
  ],
  83: [
    { formula: "Bi₂O₃", name: "氧化铋", note: "陶瓷、玻璃和催化材料" },
    { formula: "BiOCl", name: "氯氧化铋", note: "珠光颜料和化妆品材料" },
  ],
  84: [
    { formula: "PoO₂", name: "二氧化钋", note: "仅限放射化学研究" },
    { formula: "PoCl₄", name: "四氯化钋", note: "放射性钋化合物" },
  ],
  85: [
    { formula: "HAt", name: "砹化氢", note: "只能在极微量、短寿命条件下研究" },
    { formula: "AtCl", name: "氯化砹", note: "砹化学研究物种" },
  ],
  86: [{ formula: "—", name: "尚无稳定常见化合物", note: "氡寿命短，化合物研究极有限" }],
  87: [{ formula: "—", name: "仅有痕量化学预测", note: "钫太稀少且衰变太快" }],
  88: [
    { formula: "RaCl₂", name: "氯化镭", note: "历史放射化学研究物质" },
    { formula: "RaSO₄", name: "硫酸镭", note: "难溶放射性盐" },
  ],
  89: [
    { formula: "Ac₂O₃", name: "氧化锕", note: "放射化学研究物质" },
    { formula: "AcCl₃", name: "三氯化锕", note: "制备锕配合物的原料" },
  ],
  90: [
    { formula: "ThO₂", name: "二氧化钍", note: "耐高温且可研究作核燃料" },
    { formula: "ThCl₄", name: "四氯化钍", note: "钍化学原料" },
  ],
  91: [
    { formula: "Pa₂O₅", name: "五氧化二镤", note: "镤的稳定氧化物之一" },
    { formula: "PaF₅", name: "五氟化镤", note: "镤化学研究物质" },
  ],
  92: [
    { formula: "UO₂", name: "二氧化铀", note: "常见核燃料陶瓷" },
    { formula: "U₃O₈", name: "八氧化三铀", note: "铀矿加工和储存形态" },
    { formula: "UF₆", name: "六氟化铀", note: "铀同位素分离所用挥发性物质" },
  ],
  93: [
    { formula: "NpO₂", name: "二氧化镎", note: "核材料研究" },
    { formula: "NpF₆", name: "六氟化镎", note: "挥发性镎化合物" },
  ],
  94: [
    { formula: "PuO₂", name: "二氧化钚", note: "核燃料与研究形态" },
    { formula: "PuF₆", name: "六氟化钚", note: "挥发性钚化合物" },
  ],
  95: [
    { formula: "AmO₂", name: "二氧化镅", note: "镅源与研究材料" },
    { formula: "AmCl₃", name: "三氯化镅", note: "镅化学研究物质" },
  ],
  96: [
    { formula: "Cm₂O₃", name: "三氧化二锔", note: "锔的氧化物" },
    { formula: "CmCl₃", name: "三氯化锔", note: "锔化学研究物质" },
  ],
  97: [
    { formula: "Bk₂O₃", name: "三氧化二锫", note: "仅供放射化学研究" },
    { formula: "BkCl₃", name: "三氯化锫", note: "锫化学研究物质" },
  ],
  98: [
    { formula: "Cf₂O₃", name: "三氧化二锎", note: "锎的氧化物" },
    { formula: "CfCl₃", name: "三氯化锎", note: "锎化学研究物质" },
  ],
  99: [
    { formula: "Es₂O₃", name: "三氧化二锿", note: "仅以微量用于研究" },
    { formula: "EsCl₃", name: "三氯化锿", note: "锿化学研究物质" },
  ],
  100: [{ formula: "FmCl₃", name: "三氯化镄", note: "仅在痕量实验中研究" }],
  101: [{ formula: "MdCl₃", name: "三氯化钔", note: "原子级放射化学研究物种" }],
  102: [{ formula: "NoCl₂", name: "二氯化锘", note: "锘二价化学研究物种" }],
  103: [{ formula: "LrCl₃", name: "三氯化铹", note: "仅在原子级实验中研究" }],
  104: [{ formula: "RfCl₄", name: "四氯化𬬻", note: "气相超重元素化学研究物种" }],
  105: [{ formula: "DbOCl₃", name: "三氯氧化𬭊", note: "超重元素气相化学研究物种" }],
  106: [
    { formula: "Sg(CO)₆", name: "六羰基𬭳", note: "原子级气相实验研究物种" },
    { formula: "SgO₂Cl₂", name: "二氯二氧化𬭳", note: "超重元素化学研究物种" },
  ],
  107: [{ formula: "BhO₃Cl", name: "氯三氧化𬭛", note: "原子级气相实验研究物种" }],
  108: [{ formula: "HsO₄", name: "四氧化𬭶", note: "用于比较𬭶与锇的挥发性化学" }],
};

const CATEGORY_CHEMISTRY: Record<string, string> = {
  "alkali-metal": "最外层通常只有 1 个电子，容易失去它并形成 +1 价离子，因此化学性质活泼。",
  "alkaline-earth": "最外层通常有 2 个电子，常形成 +2 价离子，活泼性通常低于同周期碱金属。",
  "transition-metal": "d 轨道电子参与成键，常有多种氧化态，许多离子有颜色并能催化反应。",
  "post-transition-metal": "属于金属，但通常比典型过渡金属更软、熔点更低，成键方式也更丰富。",
  metalloid: "性质介于金属和非金属之间，导电能力可被精细控制，因此常与半导体技术相关。",
  nonmetal: "倾向通过共享或获得电子形成化学键，是生命、大气和分子世界的重要成员。",
  halogen: "最外层通常差 1 个电子达到稳定结构，容易获得电子，单质通常具有较强反应性。",
  "noble-gas": "最外层电子结构接近或达到稳定状态，常温下一般不容易与其他元素反应。",
  lanthanide: "4f 电子逐步填充，常见 +3 氧化态，许多离子具有独特磁性和发光性质。",
  actinide: "5f 电子参与复杂成键，全部具有放射性，常见多种氧化态且需要严格安全管理。",
};

const STATE_LABELS: Record<string, string> = {
  Gas: "气体",
  Solid: "固体",
  Liquid: "液体",
  "Expected to be a Gas": "预测为气体",
  "Expected to be a Solid": "预测为固体",
  "Expected to be a Liquid": "预测为液体",
};

export function elementUses(element: ElementRecord) {
  return USES[element.atomicNumber - 1] ?? ["主要用于科学研究。"];
}

export function elementCompounds(element: ElementRecord): readonly CompoundRecord[] {
  return COMPOUNDS[element.atomicNumber] ?? [
    {
      formula: "—",
      name: "尚无可稳定展示的常见化合物",
      note: "这种元素寿命很短或化学研究资料仍十分有限",
    },
  ];
}

export function chemicalSummary(element: ElementRecord) {
  const outerElectrons = element.shells.at(-1) ?? 0;
  const special = element.atomicNumber === 11
    ? "钠的电子层是 2、8、1：明亮的最外层只有 1 个电子，所以它很容易失去这个电子并发生反应。"
    : `它共有 ${element.shells.length} 个电子层，最外层有 ${outerElectrons} 个电子。`;
  return `${special} ${CATEGORY_CHEMISTRY[element.category] ?? "它的化学行为与电子排布密切相关"}`;
}

export function stateLabel(state: string | null) {
  if (!state) return "未知";
  return STATE_LABELS[state] ?? state;
}

export function kelvinLabel(value: string | null) {
  if (!value) return "未知";
  const kelvin = Number(value);
  if (!Number.isFinite(kelvin)) return value;
  const celsius = kelvin - 273.15;
  return `${kelvin.toLocaleString("zh-CN")} K（${celsius.toLocaleString("zh-CN", {
    maximumFractionDigits: 1,
  })} ℃）`;
}

export function discoveryLabel(year: string | null) {
  if (!year) return "未知";
  return year === "Ancient" ? "远古时期已知" : `${year} 年`;
}

export function neutronEstimate(element: ElementRecord) {
  return Math.max(0, Math.round(Number(element.atomicMass)) - element.atomicNumber);
}

export function nucleusParticleCounts(element: ElementRecord) {
  const neutronCount = neutronEstimate(element);
  if (element.atomicNumber <= 10) {
    return {
      exactDisplay: true,
      protons: element.atomicNumber,
      neutrons: neutronCount,
    };
  }

  const actualTotal = Math.max(1, element.atomicNumber + neutronCount);
  const displayTotal = 42;
  const protons = Math.max(
    1,
    Math.min(displayTotal - 1, Math.round(displayTotal * element.atomicNumber / actualTotal)),
  );
  return {
    exactDisplay: false,
    protons,
    neutrons: displayTotal - protons,
  };
}
