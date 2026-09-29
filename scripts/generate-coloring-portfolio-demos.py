"""Deterministic review assets; never writes personal data or changes the app.

List outputs with --list; write exactly one declared output with --write PATH.
The caller must wrap each write with the repository's before/after edit hooks.
"""
import argparse
import html
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'content/drawing-studio/prefabricated-portfolio/v1'
CATALOG = json.loads((ROOT / 'content/drawing-studio/sticker-catalog.v1.json').read_text())
ART = {s['id']: s for s in CATALOG['stickers']}
DATE = '2026-09-07T00:00:00.000Z'

# Each entry specifies a distinct scene and its identifying components, rather
# than a rotation, colour or title variation of the same composition.
GROUPS = [
('科学探索', '望远镜、磁铁、天平、滑轮、放大镜', '''星夜观测站|望远镜、月牙、松树
磁铁寻宝台|马蹄磁铁、回形针、木块
影子实验室|手电筒、球、投影屏
浮沉观察缸|水缸、软木、石块
小小气象站|风向标、雨量筒、云
斜坡滚球赛道|斜坡、圆球、收集盒
齿轮工作坊|大小齿轮、底座、曲柄
滑轮吊货架|滑轮、吊钩、货箱
天平比较台|天平、苹果、积木
声音振动台|鼓、音叉、波纹带
光线折返屋|镜片、光路带、屏幕
种子放大观察|放大镜、种子、叶片
风力小工厂|风车、传动轮、小屋
水车转转乐|水车、水槽、小桥
纸飞机试飞场|纸飞机、起飞台、靶环'''),
('化学与物质', '烧杯、试管、漏斗、晶体、分子连接棒', '''分子积木展台|水分子、二氧化碳分子、展示架
晶体收藏柜|方晶体、六角晶体、标本格
水的三种样子|冰块、水滴、蒸汽云
盐从哪里来|盐田、结晶皿、盐粒
沙水分离台|漏斗、滤纸、烧杯
颗粒排队屋|固体整齐颗粒、液体紧邻颗粒、气体稀疏颗粒
气泡观察瓶|透明瓶、上浮气泡、瓶塞
物质分类抽屉|木块、金属勺、玻璃杯
放大一滴水|水滴外框、水分子球棒、放大镜
小小试管架|试管、管架、滴管
溶解观察杯|糖粒、水杯、搅拌棒
结晶树花园|枝架、晶簇、浅盘
冰块融化盘|冰块、浅水盘、太阳
元素展览墙|空白元素卡、原子示意、展柜
分子项链工坊|双原子珠组、三原子珠组、收纳盒'''),
('昆虫观察', '卵、蛹、蜂巢、蚁巢剖面', '''蝴蝶花园|圆翅蝶、燕尾蝶、花丛
蜜蜂访花路|蜜蜂、蜂巢、向日葵
瓢虫叶片屋|瓢虫、大叶片、露珠
蜻蜓荷塘|蜻蜓、荷叶、芦苇
蚂蚁搬粮队|蚂蚁、种子、巢口
毛毛虫枝头|毛毛虫、枝条、嫩叶
蝴蝶成长环|卵、毛毛虫、蛹、蝴蝶
竹节虫藏身处|竹节虫、竹枝、叶片
螳螂草间站|螳螂、草茎、石块
蝉的树干舞台|蝉、树干、树冠
萤火虫夜草地|萤火虫、月牙、草丛
甲虫落叶地|甲虫、橡果、枯叶
蚱蜢跳跃场|蚱蜢、草叶、蘑菇
昆虫旅馆|竹筒、木孔、蜂与甲虫
地下蚁巢|蚁巢通道、粮仓、蚂蚁'''),
('人体与健康', '简化器官闭合贴纸、手掌、足部、牙齿；结构需核对', '''我的身体地图|无五官人体外框、四肢、衣服
骨骼支撑架|头骨简图、肋骨、四肢骨
心脏与血管树|心脏简图、粗血管、分支
呼吸小树|气管、左右肺、胸廓
食物旅行路线|食道、胃、肠道
手掌指纹观察|手掌、五指、放大指纹
脚印探索路|脚掌、脚印、地垫
牙齿小城堡|牙齿、牙刷、漱口杯
洗手七泡泡|双手、肥皂、泡泡
耳朵听声音|耳廓、鼓、音波带
鼻子闻花香|鼻部轮廓、花、气味线
眼睛看世界|眼部结构简图、望远镜、风景窗
关节会转弯|肩肘膝示意、屈伸手臂
睡眠小卧室|床、月亮、睡衣
运动补水站|水壶、毛巾、运动鞋'''),
('地貌与地球', '地层、溶洞、冰川、梯田轮廓', '''火山观察岛|火山、岩石、海浪
河流弯弯谷|河流、山谷、小桥
沙丘驼铃路|沙丘、路线牌、棕榈
雪山与冰川|雪峰、冰川、冰湖
峡谷探险桥|峡谷、吊桥、岩柱
瀑布落入潭|瀑布、水潭、石头
海蚀拱门湾|石拱门、海浪、贝壳
溶洞钟乳石|洞顶石笋、地面石柱、洞口
梯田山坡|层层梯田、小屋、树
地层夹心剖面|波浪地层、化石、草地
小岛环礁|中心岛、环形礁、海草
戈壁石头阵|砾石、岩丘、枯枝
湿地浅水湾|芦苇、水道、水鸟
三角洲河口|分汊河道、沙洲、帆船
地球切面拼图|地壳、地幔、地核分层'''),
('原创动漫幻想', '机器人肢体、龙轮廓、飞艇；角色保持无表情', '''机器人积木城|几何机器人、楼房、齿轮
云上邮局|云朵屋、信封、飞艇
蘑菇精灵村|蘑菇屋、小路、花
月亮小列车|弯月、列车、星轨
小龙的山谷|无表情小龙、山洞、蛋
海底机械堡|机械城堡、潜水艇、齿轮
漂浮花园岛|浮岛、树屋、藤桥
纸箱宇航员|纸箱机器人、火箭、星球
星星修理铺|星形零件、工具台、机械臂
城堡热气球港|城堡、热气球、系泊台
发条动物园|发条动物、钥匙、展台
魔法图书树|大树、书本、梯子
贝壳音乐宫|贝壳宫殿、音符轮廓、鼓
小骑士露营地|无表情骑士、盾牌、帐篷
积木飞船基地|几何飞船、着陆架、天线'''),
('家庭日常', '床、书架、厨房器具、洗衣机', '''周末家庭花园|小屋、种花孩子、园艺大人
一起做早餐|餐桌、盘子、面包
客厅阅读角|沙发、书架、读书孩子
阳台晒衣日|晾衣架、衣服、花盆
厨房收纳柜|碗碟、锅具、柜子
我的小床铺|床、枕头、被子分区
全家野餐篮|篮子、水果、餐布
宠物休息屋|猫屋、狗垫、食盆
整理玩具箱|积木、皮球、分格箱
窗台种子盆|窗户、育苗盆、水壶
洗衣小帮手|洗衣机、衣篮、袜子
家门迎宾垫|门、鞋柜、地垫
爷爷奶奶茶桌|长者、茶壶、圆桌
家庭照片墙|无五官人物轮廓、相框、挂钩
搬家纸箱车|货车、纸箱、台灯'''),
('学校生活', '课桌、书本、文具、操场器械', '''晨光校门口|校舍、书包孩子、树
我的课桌|桌子、书本、铅笔盒
图书馆借书台|书架、借书台、阅读孩子
美术教室|画架、画笔、空白画框
音乐教室|鼓、铃、谱架
积木活动区|积木城、收纳柜、地毯
操场跳绳日|跳绳孩子、跑道、球
科学角展柜|标本、放大镜、植物盆
午餐餐盘|分格餐盘、勺子、水果
午休小床排|小床、被子、窗帘
班级植物角|分层花架、花盆、洒水壶
校园雨天路|雨衣孩子、雨伞、水洼
书包收纳站|挂钩、书包、鞋格
黑板值日角|黑板、板擦、扫帚
放学公交站|公交车、站牌、孩子'''),
('露营户外', '背包、营灯、指南针、吊床', '''湖畔星空营地|帐篷、松树、月亮、湖
森林木屋周末|木屋、树、木柴
山顶观景台|观景台、山峰、望远镜
溪边搭石桥|溪流、踏脚石、背包
帐篷收纳角|帐篷、睡袋、鞋
营地早餐桌|折叠桌、餐杯、面包
树间吊床|吊床、两棵树、书
雨天营地|帐篷、雨靴、雨伞
登山路线牌|路牌、山路、登山杖
指南针寻路|指南针、地图卷、石标
营地洗手站|水桶、皂盒、毛巾
望远镜观鸟|望远镜、鸟屋、树枝
落叶采集桌|叶片、采集册、放大镜
海边露营车|房车、海浪、遮阳棚
收营整装出发|卷起帐篷、背包、手拉车'''),
('森林与植物', '根系、芽、树桩年轮、菌丝', '''大树四季屋|四季树冠、树干、叶
种子发芽记|种子、芽、幼苗
树根地下城|树根、土层、石头
蕨叶小径|蕨叶、石阶、蘑菇
竹林晨风|竹林、落叶、小亭
橡果收藏地|橡树叶、橡果、松鼠
松果山坡|松树、松果、岩石
雨林大叶窗|龟背竹叶、藤蔓、雨滴
树桩年轮地图|树桩、年轮、叶枝
苔藓石头园|苔藓团、石块、蕨叶
蘑菇森林|高低蘑菇、落叶、木桩
藤蔓拱门|藤架、缠绕枝、花
冬树枝头|裸枝、雪片、鸟屋
花朵结构台|花瓣、花蕊、萼片
果实种子柜|果实剖面、种子、抽屉'''),
('海洋与水边', '鱼、鲸、龟、蟹的闭合无五官轮廓', '''珊瑚海底花园|海马、水母、珊瑚、贝壳
灯塔守望湾|灯塔、帆船、海浪
潮池小世界|浅水池、海星、贝壳
鲸鱼远游|鲸鱼、浪带、海草
海龟巡游路|海龟、珊瑚、沙丘
螃蟹沙滩屋|螃蟹、沙洞、贝壳
帆船出港|码头、帆船、浮标
潜艇观察窗|潜艇、鱼群、海草
水母漂浮展|不同伞形水母、泡泡、海浪
海马海草林|海马、长海草、岩石
贝壳收藏盘|扇贝、海螺、分格盘
漂流瓶之旅|瓶子、岛屿、浪带
珊瑚拱门|枝珊瑚、拱形礁、鱼
荷塘小船|荷叶、荷花、小船
河岸鸭子队|小鸭、河流、芦苇'''),
('动物与栖息地', '大象、长颈鹿、企鹅、熊等无五官轮廓', '''小兔菜园|兔子、篱笆、菜叶
狐狸林间路|狐狸、树、蘑菇
松鼠树梢家|松鼠、树屋、橡果
小鹿溪边|鹿、溪流、草丛
绵羊牧场|羊、谷仓、栅栏
小猪泥塘|猪、泥塘、草棚
小鸡谷仓前|鸡、谷仓、谷粒
小狗散步日|狗、散步大人、长椅
小猫窗边|猫、窗、花盆
刺猬落叶床|刺猬、落叶、树根
乌龟晒背石|乌龟、石头、池塘
企鹅冰雪岛|企鹅、冰块、雪丘
大象水塘|象、水塘、草树
长颈鹿树叶餐|长颈鹿、高树、草原
熊的山洞|熊、洞口、石块'''),
('美术与图案', '重复排列可用现有变换；避免过密碎格', '''几何花窗|圆、三角、花窗框
大块马赛克|方块、菱形、宽边框
叶片拓印册|不同叶片、分页框、夹子
蝴蝶对称画|分区蝴蝶、花、对称轴外标
圆圈城市|圆形房屋、圆窗、半圆桥
三角山景|三角山、三角树、太阳
条纹花瓶|花瓶、宽条带、花
拼布小被子|大方格、心形、叶片
贝壳放射盘|贝壳、中心圆、外环
树叶环形花冠|叶片环、花、蝴蝶结
大格窗花|窗框、对称花瓣、菱形
石头图案路|圆石、条纹石、叶形石
形状收藏抽屉|圆、星、六边形、格柜
花瓣拼贴园|花瓣组合、叶、花盆
黑线波浪地图|宽曲带、岛形闭区、圆点轮廓'''),
('艺术与音乐', '钢琴、提琴、竖琴、画架、舞台幕布', '''小鼓乐队|大小鼓、鼓槌、舞台
钢琴练习角|钢琴、琴凳、谱架
小提琴工作台|提琴、弓、琴盒
竖琴花园|竖琴、花、长椅
铃铛音乐树|树枝、铃铛、丝带
舞蹈排练室|舞蹈孩子、扶杆、镜框
木偶小剧场|舞台、木偶、幕布
陶艺转盘|陶罐、转盘、工具
雕塑展厅|几何雕塑、底座、门廊
版画工作桌|刻板、滚筒、纸
画框展览墙|不同画框、挂线、画架
纸雕立体花|折纸花瓣、叶、展示台
编织小工坊|织框、粗线带、线轴
音乐盒转台|音乐盒、舞者轮廓、齿轮
露天演出亭|亭子、鼓、座椅'''),
('儿童游戏', '滑梯、秋千、沙堡、轮滑鞋', '''风筝草地|风筝、孩子、草丛
泡泡飞行日|泡泡圈、大泡泡、瓶
沙堡建造队|沙桶、铲、沙堡
秋千树荫|秋千、树、花
滑梯小乐园|滑梯、阶梯、球
跳房子路线|大格地板、石子、鞋
积木桥挑战|积木、桥拱、小车
拼图小桌|大拼图片、桌、盒
陀螺旋转场|陀螺、旋转环、底盘
小球滚迷宫|宽槽迷宫、球、终点盒
呼啦圈运动角|呼啦圈、鞋、毛巾
摇摇马玩具屋|摇摇马、积木、窗
小拉车游园|拉车、玩具熊、花
纸船水渠|纸船、浅水渠、桥
轮滑护具站|轮滑鞋、头盔、护膝'''),
('交通与工程', '桥梁构件、吊车、挖掘机、道路', '''火车山谷线|火车、隧道、山
城市公交总站|公交、站台、楼
自行车修理铺|自行车、气筒、工具架
机场停机坪|飞机、塔台、跑道
直升机救援台|直升机、停机台、山
热气球节|大小热气球、云、地面篮
港口装卸站|吊车、货船、箱
跨河拱桥|桥拱、河流、桥墩
挖掘机工地|挖机、土堆、围栏
拖拉机田野|拖拉机、田垄、谷仓
汽车洗车房|汽车、喷淋门、刷辊
高架轨道站|高架桥、车站、列车
风车装配厂|风车叶片、塔架、工具
小船船坞|船体、支架、船帆
道路交叉口|宽道路、斑马线、信号灯空格'''),
('太空与天文', '宇航服、空间站、月球车、太阳系比例说明', '''月球车巡逻|月球车、环形山、天线
火箭发射港|火箭、发射架、云
太阳系轨道盘|太阳、八颗行星、宽轨道
空间站连接舱|舱体、太阳能板、对接环
宇航服整理室|宇航服、头盔、手套
土星环旅行|土星、探测器、星
陨石收藏台|陨石、展盘、放大镜
彗星长尾路|彗星、尾带、星点轮廓
月相观察窗|不同月相闭区、窗口、树梢
环形山基地|月面坑、圆顶基地、小车
太空温室|舱罩、植物盆、水箱
卫星太阳翼|卫星、分格电池板、地球
星座连线卡|轮廓星、连接带、卡框
地球观测窗|地球、舷窗、云带
返回舱降落|返回舱、降落伞、地面'''),
('天气与四季', '季节部件复用；彩虹各带空白可填色', '''春雨花伞|伞、春花、雨滴
夏日树荫|大树、长椅、太阳
秋风落叶路|落叶、路、雨靴
冬日雪屋|雪屋、雪片、松树
彩虹跨山谷|空白彩虹带、山、云
雪花收藏窗|不同雪花、窗格、窗台
风吹晾衣绳|衣物、绳、风向标
暴雨窗外|雨云、窗、积水
晨雾小树林|分层雾带、树、草
霜花玻璃窗|大块霜花、窗框、叶
冰雹观察棚|棚、冰粒轮廓、桶
晴雨两扇窗|太阳窗、雨云窗、花盆
四季同一棵树|芽、树冠、果、裸枝四格
雪人围巾站|无表情雪人、围巾、帽
风筝与风向|风筝、风袋、指向标'''),
('食物与农场', '蔬菜、面包、厨房轮廓；不加拟人表情', '''苹果丰收园|苹果树、梯子、篮
草莓采摘畦|草莓、田畦、篮
南瓜小农场|南瓜、谷仓、车
面包烘焙桌|面包、擀面杖、烤盘
蔬菜分类篮|胡萝卜、叶菜、番茄、篮
水果切面展|西瓜、柠檬、苹果剖面
牛奶早餐台|奶瓶、杯、面包
稻田小水渠|稻穗、水渠、田埂
玉米脱粒桌|玉米、粒筐、桌
葡萄藤下|葡萄、棚架、叶
面条制作台|面团、粗面条带、碗
饺子排排坐|不同折边饺子、盘、擀面杖
野餐三明治|面包片、菜叶、餐盒
菜市场小摊|遮阳棚、果筐、秤
种菜小温室|温室框、菜苗、浇水壶'''),
('建筑与社区', '社区建筑外形、桌椅、邮筒', '''小镇中央广场|喷泉、长椅、小楼
邮局分信台|邮筒、信封、分格架
消防站车库|消防车、车库、水管
医院接待厅|医生、接待台、医药箱
面包店橱窗|橱窗、面包架、招牌框
图书小亭|亭子、书架、长椅
钟楼小广场|钟楼、花坛、路
桥边水磨坊|水磨屋、水轮、溪流
海边白灯塔|灯塔、阶梯、礁石
山坡风车屋|风车屋、山坡、花
公园喷泉池|喷泉分层、池沿、树
屋顶小花园|平房、花架、水桶
树屋绳梯|树屋、绳梯、树枝
雪地圆顶屋|冰屋、冰砖、雪路
社区回收站|分类桶、纸箱、瓶子'''),
]


def plan():
    rows = []
    for ci, (category, additions, source) in enumerate(GROUPS):
        lines = source.splitlines()
        assert len(lines) == 15, category
        for j, line in enumerate(lines):
            title, ingredients = line.split('|')
            rows.append(dict(id=f'pc-{ci * 15 + j + 1:03}', category=category,
                title=title, subjects=ingredients.split('、'),
                composition=f'以{ingredients.split("、")[0]}为主视觉，其余元素组成同一场景；主物占画面约四成，保留大块空白。',
                complexity=['入门', '标准', '丰富'][j // 5],
                componentReview=additions, status='planned'))
    assert len(rows) == 300 and len({r['title'] for r in rows}) == 300
    return rows


def scene(pid, title):
    return dict(schemaVersion=3, id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mumu-coloring/' + pid)),
        title='预制作品集 · ' + title, author='', createdAt=DATE, updatedAt=DATE,
        viewport=dict(x=20, y=20, zoom=0.7), elements=[], presets=[])


def element(doc, kind, x, y, w, h=None, rotation=0):
    i = len(doc['elements'])
    base = dict(id=f"{doc['id'][:8]}-{i:03}", x=x, y=y, width=w, height=h or w,
        rotation=rotation, stroke='#000000', strokeWidth=2.5, layer=0, createdOrder=i)
    if kind in ART:
        base.update(type='sticker', sticker=kind, mirrored=False, regionFills={})
    else:
        base.update(type='shape', shape=kind, fill='#ffffff')
    doc['elements'].append(base)


def demos():
    ds = []
    d = scene('pc-031', '蝴蝶花园')
    for args in [('cloud-simple',75,20,210), ('sky-sun',780,15,130),
                 ('butterfly-medium',370,60,290), ('butterfly-simple',100,235,220),
                 ('butterfly-rich-airy',685,185,210), ('flower-daisy',325,350,240),
                 ('flower-tulip',560,380,190), ('flower-sunflower',85,460,180),
                 ('leaf-oval',740,465,190), ('insect-ladybug',485,595,105),
                 ('nature-wave-patterned',40,620,250), ('nature-wave-patterned',690,650,230)]:
        element(d,*args)
    ds.append(('pc-031',d))
    d = scene('pc-121', '湖畔星空营地')
    for args in [('sky-moon',700,20,145), ('sky-star',320,45,75),
                 ('sky-star',530,105,60), ('nature-mountain',310,170,350),
                 ('tree-pine',30,235,240), ('tree-pine',740,230,210),
                 ('home-little-patterned',255,350,370),
                 ('nature-raindrops-patterned',590,490,350),
                 ('sky-moon-detailed',65,505,200),
                 ('garden-mushroom',390,655,100), ('nature-mountain-patterned',770,710,110)]:
        element(d,*args)
    ds.append(('pc-121',d))
    d = scene('pc-151', '珊瑚海底花园')
    for args in [('ocean-starfish-airy',125,65,245), ('ocean-coral-airy',530,160,260),
                 ('ocean-shell-patterned',35,385,240), ('ocean-coral',700,420,255),
                 ('ocean-shell',255,555,210), ('ocean-starfish',480,580,175),
                 ('ocean-shell-airy',635,655,140), ('ocean-coral-detailed',100,695,120)]:
        element(d,*args)
    for x,y,s in [(460,105,50),(430,215,30),(815,170,55),(805,295,35),(350,405,40)]:
        element(d,'free-ellipse',x,y,s)
    ds.append(('pc-151',d))
    d = scene('pc-091', '周末家庭花园')
    for args in [('cloud-simple',370,15,200), ('sky-sun',765,15,130),
                 ('home-little',305,180,405), ('tree-round',15,160,270),
                 ('garden-watering-can-patterned',630,390,330),
                 ('person-child-outdoor-detailed',340,485,240),
                 ('person-adult-active',70,445,260),
                 ('flower-tulip',620,550,185), ('garden-flowerpot',785,585,150),
                 ('garden-watering-can',470,680,125), ('animal-pet',800,735,115)]:
        element(d,*args)
    ds.append(('pc-091',d))
    d = scene('pc-076', '机器人积木城')
    for x,y,w,h in [(55,380,160,360),(760,330,180,410),(220,525,100,215)]:
        element(d,'free-rectangle',x,y,w,h)
        for yy in range(y+30,y+h-35,80):
            for xx in range(x+25,x+w-30,65): element(d,'free-rectangle',xx,yy,40,48)
    for args in [('free-rectangle',442,190,65,65),('free-ellipse',452,155,45),
                 ('free-rectangle',368,260,225,150),('free-rectangle',350,420,260,215),
                 ('free-rectangle',280,448,62,140),('free-rectangle',620,448,62,140),
                 ('free-ellipse',277,584,65),('free-ellipse',618,584,65),
                 ('free-rectangle',375,646,75,105),('free-rectangle',510,646,75,105),
                 ('free-rectangle',345,754,110,48),('free-rectangle',505,754,110,48),
                 ('free-rectangle',397,293,166,82), ('free-ellipse',403,452,152),
                 ('star',436,485,85),('cloud-simple',50,45,210), ('sky-sun',780,45,140)]:
        element(d,*args)
    ds.append(('pc-076',d))
    d = scene('pc-016', '分子积木展台')
    # Water: two single bonds. Carbon dioxide: two double bonds.
    # Rods are closed rectangles, independently fillable; no colour coding.
    for x,y,w,h in [(70,450,385,30),(565,450,355,30),(100,480,34,250),(391,480,34,250),
                    (595,480,34,250),(855,480,34,250)]: element(d,'free-rectangle',x,y,w,h)
    element(d,'free-rectangle',202,292,40,125,42)
    element(d,'free-rectangle',308,292,40,125,-42)
    for x,y,s in [(220,225,115),(135,350,80),(340,350,80)]:element(d,'free-ellipse',x,y,s)
    for x in [635,760]:
        for y in [307,335]:element(d,'free-rectangle',x,y,85,12)
    for x,s,y in [(575,90,280),(698,94,278),(825,90,280)]:element(d,'free-ellipse',x,y,s)
    for x,y,w,h in [(150,585,190,60),(650,585,170,60)]:element(d,'free-rectangle',x,y,w,h)
    # Geometric crystal specimens: closed independently editable shapes.
    for x,y,w in [(185,590,45),(245,595,35),(680,594,38),(735,592,42)]:element(d,'hexagon',x,y,w)
    for x,y,s in [(115,110,55),(815,115,65),(465,80,45)]:element(d,'star',x,y,s)
    ds.append(('pc-016',d))
    return ds


def svg_body(d):
    result = []
    for e in d['elements']:
        w,h=e['width'],e['height']
        result.append(f'<g data-element-id="{e["id"]}" transform="translate({e["x"]} {e["y"]}) rotate({e["rotation"]} {w/2} {h/2}) scale({w/100} {h/100})">')
        if e['type']=='sticker':
            a=ART[e['sticker']]; s=88/max(a['width'],a['height'])
            result.append(f'<g transform="translate({(100-a["width"]*s)/2} {(100-a["height"]*s)/2}) scale({s})">')
            result.extend(f'<path data-region-id="{r["id"]}" d="{r["path"]}" fill="#ffffff" fill-rule="evenodd"/>' for r in a['regions'])
            result.append(f'<path d="{a["inkPath"]}" fill="#000000" fill-rule="evenodd"/></g>')
        else:
            shapes={'free-rectangle':'<rect width="100" height="100"',
                    'free-ellipse':'<ellipse cx="50" cy="50" rx="50" ry="50"',
                    'hexagon':'<polygon points="25,7 75,7 98,50 75,93 25,93 2,50"',
                    'star':'<polygon points="50,7 61,36 92,36 67,55 76,88 50,68 24,88 33,55 8,36 39,36"'}
            fixed = '' if e['shape'] == 'star' else ' vector-effect="non-scaling-stroke"'
            result.append(shapes[e['shape']]+' data-region-id="fill" fill="#ffffff" stroke="#000000" stroke-width="2.5" stroke-linejoin="round"'+fixed+'/>')
        result.append('</g>')
    return ''.join(result)


def all_outputs():
    rows=plan(); ds=demos(); byid={pid:d for pid,d in ds}
    for r in rows:
        if r['id'] in byid:r['status']='demo'
    outputs={}
    outputs['themes.json']=json.dumps(dict(schemaVersion=1,title='预制作品集',status='style-review',themes=rows),ensure_ascii=False,indent=2)+'\n'
    md=['# 预制作品集 · 300 个主题设计', '', '阶段：风格确认。20 类 × 15 幅 = 300 幅；本轮仅制作 6 幅 demo，其余为设计清单。',
        '', '每幅都以可再次编辑的基础图元拼接，白底黑线、白色封闭涂区；没有彩色、灰色底纹、阴影、实心黑色装饰或表情。名称和练习提示放在画布外。',
        '', '难度建议：每类前 5 幅入门（约 8–16 个大部件），中 5 幅标准（约 12–24），后 5 幅丰富（约 18–36）；这是设计预算，不能用缩小部件凑数量。实际需按区域尺寸调整。',
        '', '一幅作品必须有明确主体、相互关联的环境和尺度层次。避免将不同小图整齐陈列冒充场景；明确的展台、收藏柜题材除外。']
    for category, additions,_ in GROUPS:
        md += ['',f'## {category}（15 幅）','',f'组件检查 / 可能补充：{additions}。','', '| 编号 | 主题 | 核心拼接内容 | 难度 | 状态 |','|---|---|---|---|---|']
        for r in rows:
            if r['category']==category:md.append(f'| {r["id"]} | {r["title"]} | {"、".join(r["subjects"])} | {r["complexity"]} | {"已出 demo" if r["status"]=="demo" else "待制作"} |')
    outputs['300-themes.md']='\n'.join(md)+'\n'
    manifest=[]
    for pid,d in ds:
        outputs[f'{pid}.drawing.json']=json.dumps(d,ensure_ascii=False,indent=2)+'\n'
        outputs[f'{pid}.svg']=f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="880" viewBox="0 0 1000 880"><title>{html.escape(d["title"])}</title><rect width="1000" height="880" fill="#ffffff"/>{svg_body(d)}</svg>'
        manifest.append(dict(id=pid,title=d['title'],document=f'{pid}.drawing.json',preview=f'{pid}.svg',elementCount=len(d['elements']),
            regionCount=sum(len(ART[e['sticker']]['regions']) if e['type']=='sticker' else 1 for e in d['elements']),
            componentIds=sorted({e.get('sticker',e.get('shape')) for e in d['elements']})))
    outputs['demos.json']=json.dumps(dict(schemaVersion=1,demos=manifest),ensure_ascii=False,indent=2)+'\n'
    overview=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600"><rect width="1600" height="1600" fill="white"/>',
        '<text x="55" y="66" font-family="PingFang SC,sans-serif" font-size="36" fill="black">预制作品集 · 六幅黑白拼接示范</text>']
    for i,(pid,d) in enumerate(ds):
        x=40+(i%2)*800;y=105+(i//2)*495
        overview.append(f'<svg x="{x}" y="{y}" width="720" height="425" viewBox="0 0 1000 880">{svg_body(d)}</svg>')
        overview.append(f'<text x="{x+35}" y="{y+465}" font-family="PingFang SC,sans-serif" font-size="25" fill="black">{pid} · {html.escape(d["title"].split(" · ")[1])}</text>')
    outputs['overview.svg']=''.join(overview)+'</svg>'
    outputs['README.md']='''# 预制作品集 · 风格确认包

本轮交付 300 个主题方案、6 幅可加载的拼接示范和黑白预览。没有批量制作其余 294 幅，没有修改正式玩法入口，也没有写入个人作品和进度。

打开 `300-themes.md` 查看完整分类；`themes.json` 保存稳定编号、主题、主体部件、构图原则、难度与制作状态。`demos.json` 列出示范依赖和区域数量。

## 查看与涂色

- `overview.svg` / `overview.svg.png`：六幅总览。
- `pc-xxx.svg` / `pc-xxx.svg.png`：单幅线稿；SVG 可直接用浏览器查看和打印。
- `pc-xxx.drawing.json`：现有画图格式 schemaVersion 3，使用画图顶部“加载”选择文件。加载会切换当前画布，请先保存正在画的作品。所有组成元素和贴纸区域仍能独立填色、移动、撤销和保存。未把整个场景合成一张不可编辑图片。
- 示范视口按常见桌面设置，窗口较小时可缩小或平移画布；没有修改正式自动适配行为。

## 当前能力与后续接入

经源码核对：40 种形状、6 种立体、268 张贴纸；贴纸面部保持空白。个人预制件上限 60，每个最多 100 图元，作品最多 1000 图元；个人已保存作品上限 120。300 幅官方作品应使用独立只读目录与分类索引，选择后复制为新作品，不能挤占个人预制件或保存槽位。

6 幅 demo 全部直接复用当前形状及贴纸，未扩展运行时类型，未修改共享目录。SVG 采用与当前 ShapeArt / StickerArt 相同的几何、居中缩放、白色区域和黑色墨线；数字源图不参与本轮示范。既有贴纸仍可能含小区域或较粗线，放大检查后决定是否在批量阶段重绘。

## 本轮风格样本

1. 蝴蝶花园：大蝴蝶主视觉，花叶形成上下层；观察细分翅膀的填色难度。
2. 湖畔星空营地：大帐篷与远山、树、湖组合，保留天空留白。
3. 珊瑚海底花园：无五官海马、水母、珊瑚和贝壳，适合看有机轮廓风格。
4. 周末家庭花园：无五官亲子人物与房屋、花盆，适合确认人物风格。
5. 机器人积木城：全部主要建筑与机器人用闭合几何形状拼接；屏幕空白，没有眼睛嘴巴。
6. 分子积木展台：水分子弯折三球、二氧化碳直线三球与双键连接棒；球大小仅为示意，不表示真实比例。画布不预设元素颜色。展台下方为几何晶体装饰，不表示上述分子的结晶形态。

## 批量阶段建议

确认线条粗细、主体大小、场景密度、人物空白面部、几何与贴纸两种风格能否共存，再按每批 30 幅制作。避免将同一底图只换花、数字或标题充数。

优先补充三类基础组件：科学器具；人体与地层的规范剖面；学校、家庭、交通的常用器物。每个新组件必须有稳定 ID、封闭 regionId、独立装饰线和至少一个实际使用场景。人体结构与科学图示在正式制作时逐项核对来源，不能把装饰示意当准确教学模型；本轮 300 项只是主题策划。

建议验收：有效场景格式、引用存在、纯黑白、主要区域闭合、无遮挡穿帮、缩小后仍能点击、移动端可见、填色与撤销可用。现有贴纸的小碎区不能只靠 regionCount 宣称适龄，必须放大审图并实测。

生成器：`scripts/generate-coloring-portfolio-demos.py`。输出确定性固定，`--list` 查看清单，`--write <绝对输出路径>` 每次仅写一个文件，配合仓库 beforeEditFile / afterEditFile 记录使用。PNG 由系统 SVG 预览生成，属于审核快照，运行时只使用场景数据及既有矢量图元。
'''
    return {str(OUT/k):v for k,v in outputs.items()}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--list',action='store_true')
    parser.add_argument('--write')
    args=parser.parse_args(); outputs=all_outputs()
    if args.list: print(json.dumps(list(outputs),ensure_ascii=False))
    elif args.write:
        path=str(Path(args.write).resolve())
        if path not in outputs:raise SystemExit('Not a declared output')
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        Path(path).write_text(outputs[path],encoding='utf-8')
        print(path)
    else:parser.error('use --list or --write')
