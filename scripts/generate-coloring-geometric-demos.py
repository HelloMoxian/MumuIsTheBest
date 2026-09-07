"""Second style review: scenes assembled exclusively from editable primitives.

--list is read-only. --write writes one declared file and must be surrounded
by the repository's per-file edit recording hooks by the caller.
"""
import argparse
import json
import math
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'content/drawing-studio/prefabricated-portfolio/v2'
DATE = '2026-09-07T00:00:00.000Z'
GEOMETRY = {
    'free-rectangle': '<rect width="100" height="100"',
    'free-ellipse': '<ellipse cx="50" cy="50" rx="50" ry="50"',
    'free-triangle': '<polygon points="50,0 100,100 0,100"',
}


class Scene:
    def __init__(self, key, title, theme):
        self.key, self.title, self.theme = key, title, theme
        self.parts = {}
        self.doc = dict(schemaVersion=3,
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mumu-coloring-v2/' + key)),
            title='预制作品集 · ' + title, author='', createdAt=DATE, updatedAt=DATE,
            viewport=dict(x=20, y=20, zoom=0.7), elements=[], presets=[])

    def add(self, part, shape, x, y, w, h=None, angle=0):
        h = h if h is not None else w
        n = len(self.doc['elements'])
        e = dict(id=f'{self.key}-{n:03}', type='shape', shape=shape,
            x=x, y=y, width=w, height=h, rotation=angle,
            stroke='#000000', strokeWidth=3, fill='#ffffff', layer=0, createdOrder=n)
        self.doc['elements'].append(e)
        self.parts.setdefault(part, []).append(e['id'])

    def rect(self, part, x, y, w, h, angle=0):
        self.add(part, 'free-rectangle', x, y, w, h, angle)

    def oval(self, part, x, y, w, h=None, angle=0):
        self.add(part, 'free-ellipse', x, y, w, h, angle)

    def tri(self, part, x, y, w, h, angle=0):
        self.add(part, 'free-triangle', x, y, w, h, angle)

    def tree(self, name, x, y, scale=1):
        self.rect(name, x+54*scale, y+100*scale, 30*scale, 140*scale)
        self.tri(name, x, y+80*scale, 140*scale, 100*scale)
        self.tri(name, x+12*scale, y+35*scale, 116*scale, 105*scale)
        self.tri(name, x+26*scale, y, 88*scale, 95*scale)

    def flower(self, name, x, y, scale=1):
        # Stem touches the flower centre and the bed. Every petal is editable.
        self.rect(name, x-7*scale, y+25*scale, 14*scale, 118*scale)
        self.oval(name, x-65*scale, y+70*scale, 63*scale, 30*scale, 25)
        self.oval(name, x+2*scale, y+90*scale, 63*scale, 30*scale, -25)
        for dx,dy,w,h in [(0,-38,36,65),(0,38,36,65),(-38,0,65,36),(38,0,65,36)]:
            self.oval(name, x+(dx-w/2)*scale, y+(dy-h/2)*scale, w*scale,h*scale)
        self.oval(name, x-25*scale, y-25*scale, 50*scale)

    def sun(self, x, y):
        for a in range(0,360,45):
            r=math.radians(a)
            self.rect('太阳',x+82*math.cos(r)-9,y+82*math.sin(r)-16,18,32,a-90)
        self.oval('太阳',x-49,y-49,98)


def garden():
    s=Scene('garden','门前的花园小院','pc-091')
    # A common ground plane, door-to-gate path, and anchored plants bind the scene.
    s.rect('草地',40,500,920,255)
    s.sun(817,133)
    s.tree('左侧松树',55,270,1.1)
    s.tree('右侧松树',815,305,0.8)
    s.rect('小屋',615,191,38,126)
    s.rect('小屋',606,176,56,24)
    s.rect('小屋',275,310,425,290)
    s.tri('小屋',230,120,515,225)
    # Roof triangle, circle attic window, large separate glass panes.
    s.oval('小屋',438,229,80)
    s.rect('小屋',445,411,95,189)
    s.oval('小屋',509,501,17)
    for x in [311,572]:
        s.rect('窗户',x,389,91,102)
        for dx in [9,50]:
            for dy in [10,55]:s.rect('窗户',x+dx,389+dy,32,36)
        s.rect('窗户',x-8,491,107,18)
    s.rect('台阶',426,600,134,25)
    s.rect('台阶',412,625,162,25)
    for x,y,w in [(436,664,114),(420,704,144)]:s.oval('小路踏石',x,y,w,28)
    # Fences are connected assemblies, not standalone ornamental tiles.
    for x,w in [(45,330),(625,330)]:
        s.rect('围栏',x,661,w,18)
        s.rect('围栏',x,711,w,18)
        for xx in range(x+8,x+w-30,68):
            s.rect('围栏',xx,641,35,108)
            s.tri('围栏',xx,621,35,20)
    for args in [('左花',153,515,.72),('右花',772,554,.61)]:s.flower(*args)
    # The planting beds mask lower stems; the plants emerge from the soil.
    s.rect('左花坛',83,619,154,25)
    s.rect('右花坛',717,641,139,25)
    return s


def train():
    s=Scene('train','小火车驶过山谷桥','pc-226')
    # Mountains sit behind a continuous bridge and river scene.
    s.tri('远山',45,92,390,395)
    s.tri('远山',421,69,438,419)
    s.tri('雪帽',171,92,138,140)
    s.tri('雪帽',567,69,146,140)
    s.oval('太阳',80,70,74)
    s.rect('河谷',40,548,920,207)
    # Visible water strips remain broad closed areas.
    for x,y,w in [(78,664,120),(365,724,155),(692,694,147)]:s.oval('河流波带',x,y,w,17)
    for x in [125,420,765]:
        s.rect('桥墩',x,550,83,179)
        s.rect('桥墩',x-13,714,109,26)
    s.rect('桥梁',40,536,920,48)
    s.rect('铁轨',40,513,920,23)
    # Couplings are hidden under the bodies so adjoining cars form one train.
    s.rect('车钩',282,457,61,21)
    s.rect('车钩',539,457,64,21)
    for part,x in [('后车厢',86),('前车厢',335)]:
        s.rect(part,x,357,214,115)
        s.rect(part,x-8,341,230,22)
        s.rect(part,x,450,214,35)
        for xx in [x+22,x+119]:s.rect(part,xx,375,73,54)
        for xx in [x+39,x+145]:
            s.oval(part,xx-27,459,54)
            s.oval(part,xx-11,475,22)
    # Engine silhouette: tall cabin, horizontal boiler, chimney, large wheels.
    s.rect('火车头',583,320,119,165)
    s.rect('火车头',570,302,145,24)
    s.rect('火车头',608,343,65,59)
    s.rect('火车头',700,394,161,91)
    s.rect('火车头',792,337,34,57)
    s.rect('火车头',780,322,58,20)
    s.rect('火车头',575,461,315,26)
    s.tri('火车头',853,435,63,54,90)
    for x in [623,734,829]:
        s.oval('火车头',x-32,449,64)
        s.oval('火车头',x-14,467,28)
    for x,y,w,h in [(798,265,31,34),(820,205,47,40),(843,134,63,48)]:s.oval('蒸汽',x,y,w,h)
    return s


def moon():
    s=Scene('moon','月球基地搭建日','pc-250')
    s.oval('月面',40,541,920,218)
    for args in [(96,663,128,40),(735,687,139,38),(412,706,101,28)]:s.oval('环形山',*args)
    s.oval('远方星球',690,66,138)
    s.oval('星球斑块',711,88,52,35)
    s.oval('星球斑块',759,137,47,43)
    for x,y,size in [(101,134,19),(451,91,25),(590,198,15),(865,259,21)]:s.oval('远方星点',x,y,size)
    # Main rocket touches its pad. Body, nose, fins, portholes are actual shapes.
    s.rect('发射台',102,609,334,27)
    s.tri('火箭',143,429,116,170)
    s.tri('火箭',287,429,116,170)
    s.rect('火箭',212,286,122,313)
    s.tri('火箭',212,146,122,140)
    s.rect('火箭',212,544,122,30)
    s.rect('火箭',224,599,98,10)
    for y in [325,422]:
        s.oval('火箭舷窗',235,y,76)
        s.oval('火箭舷窗',247,y+12,52)
    # Connector visibly joins the dome and the solar power support.
    s.rect('连接舱',655,497,194,51)
    s.oval('居住舱',440,350,292,276)
    s.rect('居住舱',440,494,292,106)
    s.rect('居住舱',430,600,312,24)
    s.rect('舱门',560,490,62,110)
    s.rect('舱门',571,507,40,42)
    for x in [474,632]:s.oval('居住舱窗',x,451,56)
    s.rect('天线',570,292,17,60)
    s.oval('天线',556,265,46)
    s.rect('太阳能架',811,422,22,168)
    s.rect('太阳能板',751,322,164,115)
    for x in [762,813,864]:
        for y in [333,384]:s.rect('太阳能板',x,y,40,42)
    # A small rover in the foreground provides scale and a second buildable object.
    s.rect('月球车',478,642,134,49)
    s.rect('月球车',503,610,69,32)
    s.rect('月球车',560,576,12,34)
    s.oval('月球车',550,560,32)
    for x in [497,588]:
        s.oval('月球车',x-23,674,46)
        s.oval('月球车',x-10,687,20)
    return s


def body(doc):
    result=[]
    for e in doc['elements']:
        w,h=e['width'],e['height']
        result.append(f'<g data-element-id="{e["id"]}" transform="translate({e["x"]} {e["y"]}) rotate({e["rotation"]} {w/2} {h/2}) scale({w/100} {h/100})">')
        result.append(GEOMETRY[e['shape']]+' data-region-id="fill" fill="#ffffff" stroke="#000000" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>')
    return ''.join(result)


def outputs():
    scenes=[garden(),train(),moon()]
    out={}; meta=[]
    for s in scenes:
        elements=s.doc['elements']
        assert len(elements)<1000 and all(e['type']=='shape' and e['shape'] in GEOMETRY for e in elements)
        assert all(e['fill']=='#ffffff' and e['stroke']=='#000000' and 'groupId' not in e for e in elements)
        # Check real rotated bounding boxes, not only unrotated boxes.
        for e in elements:
            a=math.radians(e['rotation']); w=e['width'];h=e['height']
            rw=abs(w*math.cos(a))+abs(h*math.sin(a));rh=abs(w*math.sin(a))+abs(h*math.cos(a))
            cx=e['x']+w/2;cy=e['y']+h/2
            assert cx-rw/2>=0 and cy-rh/2>=0 and cx+rw/2<=1000 and cy+rh/2<=800,e
        out[s.key+'.drawing.json']=json.dumps(s.doc,ensure_ascii=False,indent=2)+'\n'
        out[s.key+'.svg']=f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><title>{s.title}</title><rect width="1000" height="1000" fill="white"/><g transform="translate(0 90)">{body(s.doc)}</g></svg>'
        meta.append(dict(id=s.key,title=s.title,themeId=s.theme,elementCount=len(elements),
            shapeCounts={k:sum(e['shape']==k for e in elements) for k in GEOMETRY},
            parts=s.parts,document=s.key+'.drawing.json',preview=s.key+'.svg'))
    out['demos.json']=json.dumps(dict(schemaVersion=1,style='editable-geometric-diy',demos=meta),ensure_ascii=False,indent=2)+'\n'
    # Square review sheet avoids platform Quick Look cropping non-square SVGs.
    overview=['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1800" viewBox="0 0 1800 1800"><rect width="1800" height="1800" fill="white"/>',
        '<text x="70" y="69" font-family="PingFang SC,sans-serif" font-size="37">预制作品集 · 基础图形 DIY 第二版</text>']
    for i,s in enumerate(scenes):
        x,y=[(40,160),(925,160),(455,990)][i]
        overview.append(f'<text x="{x+30}" y="{y+28}" font-family="PingFang SC,sans-serif" font-size="28">0{i+1}　{s.title}</text>')
        overview.append(f'<svg x="{x}" y="{y+60}" width="840" height="672" viewBox="0 0 1000 800">{body(s.doc)}</svg>')
    out['overview.svg']=''.join(overview)+'</svg>'
    out['README.md']='''# 预制作品集 · 基础图形 DIY 第二版

第一版的复杂贴纸方向已被否定。本轮重做三个完整场景，全部使用现有拖框矩形、拖框椭圆、拖框三角形；不引用贴纸，不嵌入图片，不新增运行时类型。第一版保留作历史比较，后续生产以本轮反馈为准。

## 三份可加载作品

| 作品 | 构图关系 | 可以拆改的部件 |
|---|---|---|
| 门前的花园小院 | 小屋落地，门连接台阶和踏石，围栏围出院子，花从花坛长出 | 三角屋顶、矩形墙、圆窗、分格窗、松树、花瓣、围栏 |
| 小火车驶过山谷桥 | 车厢由车钩相连，车轮接轨，轨道落在桥面，桥墩伸入河谷 | 车厢、窗、轮、车钩、锅炉、烟囱、桥墩、山峰 |
| 月球基地搭建日 | 火箭接发射台，居住舱连接太阳能架，月球车与基地共用月面 | 火箭头、箭身、舷窗、侧翼、舱门、太阳能格、车轮 |

每个圆、矩形、三角形都是真正独立的 shape 图元：可以单独填色、移动、缩放、旋转、删除；没有把一整朵花或一座房子做成复杂区域贴纸。所有边界闭合，描边均为黑色，填充均为白色，使用正式玩法的 3px non-scaling-stroke。渲染层级与稳定创建顺序均保留。

默认不锁组，方便重新拼装。需要整物移动时框选对应部件；需要重复使用时可用现有“打包为预制件”。`demos.json` 的 parts 字段记录语义部件到图元 ID 的关系，方便后续接入对象选择；它是资产说明，不是新增保存协议。

部分前后遮挡用于组合物体（窗户覆盖墙面、轮子覆盖车身、舱底覆盖椭圆下缘）。这是独立形状叠放，填色作用于实际被点击的前景形状；被遮挡的背景部分仍随原形状保存，移动前景后能继续编辑。没有用画笔假画闭合区域，也没有用白色蒙版冒充可操作元素。

## 查看和加载

SVG 是完整矢量预览，PNG 是审核快照。画图顶部“加载”可打开同名 `.drawing.json` 文件。先保存正在画的作品，再加载示范；示范不自动写入个人作品清单或预制件目录。浏览器打开 SVG 只是查看，涂色需要加载作品 JSON。

## 300 主题的后续生产规则

保留 `../v1/300-themes.md` 中的 300 个主题作为选题池；旧组件建议与部件数预算作废。新方案优先把物体分解为 3–15 个原始几何图元，以统一场景的地面、台面、连接结构建立整体关系。复杂画面增加可编辑的形状数量，不能用一张复杂贴纸替代。

先用这三个场景确认基础几何风格、画面密度、边线粗细与大块涂区，再重新编排批次。人体、昆虫等需要曲线的主题，优先用椭圆和细长矩形搭建；只有现有基础形状明显无法表达时，再评估增加通用封闭曲线形状，不能按每幅主题添加整张复杂贴纸。

本轮未修改正式页面、共享图形目录、其他正在开发的功能，也未批量制作剩余作品。
'''
    return {str(OUT/k):v for k,v in out.items()}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--list',action='store_true');p.add_argument('--write')
    args=p.parse_args(); data=outputs()
    if args.list:print(json.dumps(list(data),ensure_ascii=False))
    elif args.write:
        path=str(Path(args.write).resolve())
        if path not in data:raise SystemExit('Not a declared output')
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        Path(path).write_text(data[path],encoding='utf-8')
        print(path)
    else:p.error('Use --list or --write')
