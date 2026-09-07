#!/usr/bin/env python3
"""Build the offline stargazing catalog from pinned, attributable public data.

Only --write changes a file. Default execution validates the checked-in catalog.
Use the repository beforeEditFile/afterEditFile recording around --write.
No dependencies, credentials, telemetry, or downloads at product runtime.
"""

import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/src/features/stargazing/catalog.json"
HYG_COMMIT = "c7f7f883fe678cc7680169a50ccd7dcc49b060ce"
D3_COMMIT = "7e720a3de062059d4c5400a379146a601d9010e0"
HYG_URL = f"https://raw.githubusercontent.com/astronexus/HYG-Database/{HYG_COMMIT}/hyg/CURRENT/hygdata_v41.csv"
D3_BASE = f"https://raw.githubusercontent.com/ofrohn/d3-celestial/{D3_COMMIT}/data/"
HYG_SOURCE = "https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md"
IAU_SOURCE = "https://iauarchive.eso.org/public/themes/constellations/"
BALL_SOURCE = "https://arxiv.org/abs/1201.1809"
NASA_TYPES = "https://science.nasa.gov/universe/stars/types/"
NASA_ORION = "https://apod.nasa.gov/apod/ap980829.html"
NASA_BETELGEUSE = "https://science.nasa.gov/universe/what-is-betelgeuse-inside-the-strange-volatile-star/"
NASA_SIRIUS = "https://science.nasa.gov/asset/hubble/the-dog-star-sirius-and-its-tiny-companion/"
NASA_ALTAIR = "https://science.nasa.gov/photojournal/altair/"
NASA_TRIANGLE = "https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-altair/"
ESO_ACHERNAR = "https://www.eso.org/public/news/eso0316/"
ESO_ANTARES = "https://www.eso.org/public/news/eso1726/"
CHARA_ROTATION = "https://chara.gsu.edu/science-highlights/rapid-rotators"
ALTAIR_PAPER = "https://www.aanda.org/articles/aa/full_html/2020/01/aa36830-19/aa36830-19.html"
VEGA_PAPER = "https://academic.oup.com/mnras/article/505/2/1905/6276737"

# Simplified Chinese conventional names; modern IAU constellations, not Chinese asterisms.
NAMES = dict(item.split(":") for item in """
And:仙女座 Ant:唧筒座 Aps:天燕座 Aqr:宝瓶座 Aql:天鹰座 Ara:天坛座 Ari:白羊座 Aur:御夫座
Boo:牧夫座 Cae:雕具座 Cam:鹿豹座 Cnc:巨蟹座 CVn:猎犬座 CMa:大犬座 CMi:小犬座 Cap:摩羯座
Car:船底座 Cas:仙后座 Cen:半人马座 Cep:仙王座 Cet:鲸鱼座 Cha:蝘蜒座 Cir:圆规座 Col:天鸽座
Com:后发座 CrA:南冕座 CrB:北冕座 Crv:乌鸦座 Crt:巨爵座 Cru:南十字座 Cyg:天鹅座 Del:海豚座
Dor:剑鱼座 Dra:天龙座 Equ:小马座 Eri:波江座 For:天炉座 Gem:双子座 Gru:天鹤座 Her:武仙座
Hor:时钟座 Hya:长蛇座 Hyi:水蛇座 Ind:印第安座 Lac:蝎虎座 Leo:狮子座 LMi:小狮座 Lep:天兔座
Lib:天秤座 Lup:豺狼座 Lyn:天猫座 Lyr:天琴座 Men:山案座 Mic:显微镜座 Mon:麒麟座 Mus:苍蝇座
Nor:矩尺座 Oct:南极座 Oph:蛇夫座 Ori:猎户座 Pav:孔雀座 Peg:飞马座 Per:英仙座 Phe:凤凰座
Pic:绘架座 Psc:双鱼座 PsA:南鱼座 Pup:船尾座 Pyx:罗盘座 Ret:网罟座 Sge:天箭座 Sgr:人马座
Sco:天蝎座 Scl:玉夫座 Sct:盾牌座 Ser:巨蛇座 Sex:六分仪座 Tau:金牛座 Tel:望远镜座 Tri:三角座
TrA:南三角座 Tuc:杜鹃座 UMa:大熊座 UMi:小熊座 Vel:船帆座 Vir:室女座 Vol:飞鱼座 Vul:狐狸座
""".split())

# Editorial familiarity/recognisability for a Chinese family audience, never an IAU ranking.
# Remaining constellations retain a deterministic alphabetical order after these choices.
RECOMMENDED = """Ori UMa Cas Sco Leo UMi Gem Tau Lyr Cyg Aql Sgr Vir And Peg Per Ari Cnc Lib Cap Aqr Psc
Cru CMa Aur Boo Cep Dra Her Cen Oph Eri Cet PsA CMi CrB Del Hya Com CVn Sge Ser Car Pup Vel Tri Lep""".split()
# The astronomical ecliptic crosses 13 modern IAU constellations, including Ophiuchus.
# This differs from the traditional twelve zodiac signs.
ZODIAC = set("Ari Tau Gem Cnc Leo Vir Lib Sco Oph Sgr Cap Aqr Psc".split())

CONSTELLATION_NOTES = {
    "Ori": "先找腰间排成一列的三颗亮星，再看橙红的参宿四与蓝白的参宿七。它是练习辨认恒星颜色的好地方。",
    "UMa": "熟悉的北斗七星就在大熊座里。北斗是一个星群图案，并不是独立的现代星座。",
    "UMi": "北极星位于小熊尾巴末端，靠近北天极。它帮助我们辨认北方，却不是夜空最亮的恒星。",
    "Cas": "五颗主要亮星排成醒目的 W 或 M 形；随观看方向不同，这个字母也会转动。",
    "Sco": "弯曲的星链像长长的蝎尾，橙红的心宿二位于蝎子心口附近。",
    "Leo": "前半部像弯弯的问号，后半部是三角形。蓝白的轩辕十四是它的一颗标志亮星。",
    "Gem": "北河二与北河三像一对并肩的头。仔细比较，两颗亮星的颜色并不相同。",
    "Tau": "橙色的毕宿五帮助勾出牛的眼睛。星座图案只表示看上去的方向，不表示所有星星住在一起。",
    "Lyr": "织女星是这个小星座最醒目的亮点，也是夏季大三角的一个顶点。",
    "Cyg": "沿着天鹅长长的翅膀和身体连线，可以找到十字形图案。天津四是夏季大三角的一角。",
    "Aql": "牛郎星位于天鹰座，也是夏季大三角的一角。它自转很快，赤道比两极更鼓。",
    "Sgr": "主要亮星常被连成一把茶壶。它靠近银河中心在天空中的方向。人马座也常叫射手座。",
    "Vir": "角宿一是这个广阔星座的醒目蓝白色亮星。室女座也常叫处女座。",
    "And": "从飞马大四边形的一角向外延伸，就能顺着星链认识仙女座。",
    "Peg": "先认出秋夜醒目的大四边形；其中一角的壁宿二在正式划分中属于仙女座。",
    "Per": "沿着仙后座与御夫座之间的星链，可以找到英仙座。天船三是它的标志亮星。",
    "Ari": "它的主图案较短，娄宿三是较容易先找到的亮星。需要较暗的天空才能看清更多成员。",
    "Cnc": "巨蟹座位于双子与狮子之间，主要恒星比较暗，适合放大后慢慢寻找。",
    "Lib": "天秤座的图案像一架天平，位于室女与天蝎之间。",
    "Cap": "较暗的恒星围出一个宽三角形。不要把星座名称与恒星的物理性质混为一谈。",
    "Aqr": "宝瓶座又常被叫作水瓶座。它是一片范围很广、亮星较少的天空区域。",
    "Psc": "两条鱼的星链由长长的线连接起来，是黄道附近较大的星座。",
    "Cru": "四颗主要亮星组成小巧的十字。它面积很小，却是南天很有辨识度的图案。",
    "CMa": "夜空中最亮的恒星天狼星位于大犬座。显得亮既与发光能力有关，也与距离有关。",
    "CMi": "南河三是小犬座的标志星；这个星座的主要连线很短，适合从两颗星开始认识。",
    "Aur": "明亮的五边形附近有金黄色的五车二。亮点也可能是多颗恒星组成的系统。",
    "Boo": "从北斗斗柄沿弧线向外寻找，会遇见牧夫座的橙色亮星大角星。",
    "Cep": "主图案像一座尖屋顶的小房子，位于仙后座与北天极之间。",
    "Dra": "一条长长的星链盘绕在大小熊之间；转动天空更容易看出它蜿蜒的形状。",
    "Her": "中央四边形常叫作楔石图案，可以先找到它，再沿连线寻找手脚。",
    "Cen": "半人马座有多颗明亮的南天恒星。南门二是太阳近邻恒星系统中的成员。",
    "Oph": "蛇夫座位于天蝎以北。太阳也会经过它，但它不属于传统黄道十二星座的那十二个名称。",
    "Eri": "这条很长的天河从猎户座旁一路流向南方，蓝色亮星水委一靠近它的南端。",
    "Cet": "鲸鱼座占据很大一片天空。星座面积说的是天空区域，不是某一颗恒星的大小。",
    "PsA": "北落师门是南鱼座最醒目的亮星；周围亮星较少，让它更容易引人注意。",
    "CrB": "几颗恒星围成小小的弧线，就像一顶弯弯的王冠。",
    "Del": "一个小菱形加上一段尾巴，是海豚座可爱的主要图案。",
    "Hya": "长蛇座是全天面积最大的现代星座，长长的身体跨过很大一段天空。",
    "Com": "后发座的名字让人联想到一束头发；这里的主图案由比较暗的恒星组成。",
    "CVn": "猎犬座在大熊座下方，常以常陈一等亮星作为寻找的起点。",
    "Sge": "天箭座的主要星链像一支小箭，位于天鹰与天鹅之间。",
    "Ser": "巨蛇座分成蛇头和蛇尾两片，被蛇夫座隔开；这里将两片一起展示为一个星座。",
    "Car": "船底座的老人星是夜空非常明亮的恒星；它在偏南的天空中出现。",
    "Pup": "船尾座曾与船底座、船帆座共同属于历史上的南船座。现代星图将它们分开。",
    "Vel": "船帆座是历史上南船座的一部分；明亮的星链像一张展开的船帆。",
    "Tri": "三颗主要恒星围出一个细长三角形，是练习看图连线的简单目标。",
    "Lep": "天兔座在猎户座脚下；找到参宿七后，再向南看这只小兔的主图案。",
}

STAR_NAMES = {
    "Sirius": "天狼星", "Canopus": "老人星", "Arcturus": "大角星", "Vega": "织女星",
    "Capella": "五车二", "Rigel": "参宿七", "Procyon": "南河三", "Achernar": "水委一",
    "Betelgeuse": "参宿四", "Hadar": "马腹一", "Altair": "牛郎星", "Aldebaran": "毕宿五",
    "Spica": "角宿一", "Antares": "心宿二", "Pollux": "北河三", "Fomalhaut": "北落师门",
    "Deneb": "天津四", "Mimosa": "十字架三", "Regulus": "轩辕十四", "Adhara": "弧矢七",
    "Castor": "北河二", "Gacrux": "十字架一", "Shaula": "尾宿八", "Bellatrix": "参宿五",
    "Elnath": "五车五", "Alnilam": "参宿二", "Alnitak": "参宿一", "Mintaka": "参宿三",
    "Polaris": "北极星", "Rigil Kentaurus": "南门二 A", "Toliman": "南门二 B", "Acrux": "十字架二",
    "Dubhe": "天枢", "Merak": "天璇", "Phecda": "天玑", "Megrez": "天权", "Alioth": "玉衡",
    "Mizar": "开阳", "Alkaid": "摇光", "Alcor": "辅星", "Alpheratz": "壁宿二", "Mirach": "奎宿九",
    "Almach": "天大将军一", "Shedir": "王良四", "Caph": "王良一", "Schedar": "王良四",
    "Denebola": "五帝座一", "Algol": "大陵五", "Mirfak": "天船三", "Hamal": "娄宿三",
    "Enif": "危宿三", "Markab": "室宿一", "Scheat": "室宿二", "Algenib": "壁宿一",
    "Rasalhague": "候", "Ras Alhague": "候", "Kochab": "北极二", "Pherkad": "北极一",
    "Alphard": "星宿一", "Alnair": "鹤一", "Al Nair": "鹤一", "Kaus Australis": "箕宿三",
    "Nunki": "斗宿四", "Atria": "三角形三", "Alderamin": "天钩五", "Saiph": "参宿六",
    "Sadr": "天津一", "Albireo": "辇道增七", "Alkaid": "摇光", "Cor Caroli": "常陈一",
    "Alhena": "井宿三", "Wezen": "弧矢一", "Mirzam": "军市一", "Alcyone": "昴宿六",
}

# Per-star narratives combine catalog facts with the linked primary source.
# Values here are explicitly rounded educational examples from those publications.
FEATURED = {
    "Sirius": ("夜空最亮的恒星看起来蓝白而耀眼。我们看到的亮光主要来自天狼星 A；它还有一颗很小的白矮星伴星。", [NASA_SIRIUS]),
    "Canopus": ("老人星是船底座的明亮恒星。它看起来偏白，距离比天狼星远得多，却仍然十分醒目。", []),
    "Arcturus": ("大角星是一颗橙色巨星。沿着北斗斗柄的弧线延伸，是在星图上寻找它的常用办法。", []),
    "Vega": ("织女星是夏季大三角的一角。它并非静止的完美圆球：快速自转使赤道鼓起，赤道也比两极更凉。", [NASA_TRIANGLE, CHARA_ROTATION]),
    "Capella": ("五车二看起来是一个明亮的金黄色光点。它实际是多星系统；星表的颜色与亮度包含系统成员的共同贡献。", []),
    "Rigel": ("猎户座脚边的参宿七是一颗蓝白色超巨星。与橙红的参宿四一起看，能直观发现恒星并非全是白色。", [NASA_ORION]),
    "Procyon": ("南河三是一颗偏黄白色的近邻亮星。HYG 光谱把它放在主序与次巨星之间，显示恒星也会经历不同成长阶段。", []),
    "Achernar": ("水委一是炽热的蓝色恒星。ESO 的干涉观测发现它明显扁圆；2003 年模型给出约 12 个太阳半径的赤道半径和约 6 个太阳质量。", [ESO_ACHERNAR]),
    "Betelgeuse": ("参宿四是猎户座肩头的橙红色超巨星。NASA 科普采用约 700 个太阳半径、15 个太阳质量与 3600 K；这些近似值会随观测模型变化。", [NASA_BETELGEUSE]),
    "Hadar": ("马腹一是半人马座的蓝白色亮星。它的 B 型光谱说明表面比太阳更热，不能把蓝色理解为寒冷。", [NASA_TYPES]),
    "Altair": ("牛郎星是夏季大三角的一角。2020 年二维模型估计赤道自转约 314 千米每秒，赤道半径约为太阳的 2 倍；快速旋转让它像被轻轻压扁的球。", [ALTAIR_PAPER, NASA_TRIANGLE]),
    "Aldebaran": ("毕宿五是金牛座醒目的橙色巨星。它的偏红颜色与较低的表面温度有关，大小与亮度却不能单凭颜色判断。", [NASA_TYPES]),
    "Spica": ("角宿一发出蓝白色光。它的 B 型光谱与负色指数共同提示：这是一颗表面炽热的恒星。", [NASA_TYPES]),
    "Antares": ("天蝎座心口的心宿二有明显橙红色。ESO 已解析到这颗红超巨星的表面及大气运动；这里的大球是解释用的示意画面。", [ESO_ANTARES]),
    "Pollux": ("北河三是双子座偏橙色的巨星。把它与附近更白的北河二相比，可以练习用颜色辨认两颗星。", [NASA_TYPES]),
    "Fomalhaut": ("北落师门是南鱼座的一颗白色近邻亮星。它周围缺少同样明亮的恒星，因此在星图里特别容易被发现。", []),
    "Deneb": ("天津四标记天鹅的尾端，也是夏季大三角的一角。它很遥远，但极强的发光能力让它依然是醒目的亮星。", [NASA_TRIANGLE]),
    "Mimosa": ("十字架三位于南十字座，是一颗蓝白色的 B 型恒星。与同座偏红的十字架一相比，颜色反差十分明显。", [NASA_TYPES]),
    "Regulus": ("轩辕十四是狮子座的蓝白色亮星。CHARA 干涉观测确认它快速自转，赤道鼓起且比两极暗一些。", [CHARA_ROTATION]),
    "Castor": ("北河二在星图中是一颗偏白的亮点，旁边的北河三更偏橙色。星表亮点不一定等于一颗完全孤立的恒星。", []),
    "Gacrux": ("十字架一是南十字座里偏红的巨星。它的 M 型光谱与较大的正色指数，都对应较暖的红橙色外观。", [NASA_TYPES]),
    "Bellatrix": ("参宿五位于猎户的另一侧肩头。它的 B 型光谱与偏蓝的色指数，让它与参宿四形成鲜明对照。", [NASA_ORION]),
    "Polaris": ("北极星靠近北天极，所以北方天空绕着它附近缓慢转动。它不是夜空最亮的恒星，而是一颗偏黄白色的亮星。", [IAU_SOURCE]),
    "Rigil Kentaurus": ("南门二 A 是与太阳光谱相近的 G 型恒星，也是离太阳很近的恒星系统成员。这里展示的是星表中的 A 星。", []),
    "Alnitak": ("参宿一是猎户腰带三颗亮星之一。它的 O 型光谱表明表面非常热，常呈现蓝白色光。", [NASA_ORION]),
}

SOURCES = [
    {"title": "IAU · 88 星座与星座图", "url": IAU_SOURCE, "note": "现代星座定义与名称；连线是识别图案，没有唯一的 IAU 官方画法。"},
    {"title": "HYG 4.1 · 恒星目录", "url": HYG_SOURCE, "note": "David Nash / Astronexus；CC BY-SA 4.0；位置、星等、距离、光谱、B−V 色指数、视觉波段相对光度。"},
    {"title": "d3-celestial · 星座连线与边界", "url": "https://github.com/ofrohn/d3-celestial", "note": "Olaf Frohn；BSD-3-Clause；J2000 星座连线、中心与边界。巨蛇座两片合并。"},
    {"title": "Ballesteros (2012) · 色温近似", "url": BALL_SOURCE, "note": "由 B−V 推算近似色温；星际消光、金属丰度、双星等会带来偏差。"},
    {"title": "NASA · 恒星类型", "url": NASA_TYPES, "note": "恒星颜色、温度和演化类型的基础解释。"},
    {"title": "NASA · 参宿四", "url": NASA_BETELGEUSE, "note": "红超巨星的橙红颜色，以及用于科普的近似温度、半径和质量。"},
    {"title": "NASA · 天狼星与白矮星伴星", "url": NASA_SIRIUS, "note": "夜空最亮恒星与双星系统的说明。"},
    {"title": "A&A (2020) · 牛郎星二维模型", "url": ALTAIR_PAPER, "note": "赤道速度约 314 km/s、赤道半径 2.008 个太阳、质量 1.86 个太阳；模型依赖的估计。"},
    {"title": "MNRAS (2021) · 织女星旋转", "url": VEGA_PAPER, "note": "赤道速度约 195 km/s；不同于受倾角影响的投影速度 v sin i。"},
    {"title": "NASA · 夏季大三角", "url": NASA_TRIANGLE, "note": "织女星、牛郎星和天津四，分别属于三个现代星座。"},
    {"title": "ESO · 水委一", "url": ESO_ACHERNAR, "note": "快速自转与扁圆外观；采用 2003 年发布的示例参数，不宣称最新测量。"},
    {"title": "ESO · 心宿二表面", "url": ESO_ANTARES, "note": "红超巨星表面与大气运动的真实干涉观测。"},
    {"title": "CHARA · 快速自转恒星", "url": CHARA_ROTATION, "note": "旋转扁率与重力昏暗；赤道比两极更凉、相对更暗。"},
]


def download(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def vector(point):
    ra, dec = map(math.radians, point)
    return [math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def spherical_area(ring):
    """Signed spherical-triangle excess, converted to approximate square degrees."""
    points = list(map(vector, ring))
    area = 0
    for index in range(1, len(points) - 1):
        a, b, c = points[0], points[index], points[index + 1]
        area += 2 * math.atan2(dot(a, cross(b, c)), 1 + dot(a, b) + dot(b, c) + dot(c, a))
    return abs(area) * (180 / math.pi) ** 2


def season(ra, dec):
    # Approximate northern mid-latitude evening viewing grouping, not a visibility prediction.
    if dec < -45:
        return "south"
    hours = ra / 15
    if 9 <= hours < 15:
        return "spring"
    if 15 <= hours < 21:
        return "summer"
    if hours >= 21 or hours < 3:
        return "autumn"
    return "winter"


def build():
    raw_hyg = download(HYG_URL)
    raw_names = download(D3_BASE + "constellations.json")
    raw_lines = download(D3_BASE + "constellations.lines.json")
    raw_bounds = download(D3_BASE + "constellations.bounds.json")
    metadata = json.loads(raw_names)["features"]
    line_features = json.loads(raw_lines)["features"]
    boundary_features = json.loads(raw_bounds)["features"]
    order = RECOMMENDED + sorted(set(NAMES) - set(RECOMMENDED))
    lines, areas = {}, {}
    for item in line_features:
        lines.setdefault(item["id"], []).extend([
            [[round(ra % 360, 6), dec] for ra, dec in line]
            for line in item["geometry"]["coordinates"]
        ])
    for item in boundary_features:
        areas[item["id"]] = areas.get(item["id"], 0) + spherical_area(item["geometry"]["coordinates"][0])
    constellations = {}
    for item in metadata:
        cid = item["id"]
        if cid in constellations:
            continue
        ra, dec = item["geometry"]["coordinates"]
        ra = ra % 360
        if cid == "Ser":
            # A deliberate view center between Caput and Cauda; both polylines are retained.
            ra, dec = 259, 1
        constellations[cid] = {
            "id": cid, "name": NAMES[cid], "latinName": item["properties"]["name"],
            "ra": ra, "dec": dec, "area": round(areas[cid], 1), "rank": order.index(cid) + 1,
            "season": season(ra, dec), "zodiac": cid in ZODIAC,
            "description": CONSTELLATION_NOTES.get(cid, f"{NAMES[cid]}是 IAU 认可的 88 个现代星座之一。顺着星链寻找它的主要图案，再点开恒星比较颜色与距离。"),
            "lines": lines[cid], "sourceUrls": [IAU_SOURCE, "https://github.com/ofrohn/d3-celestial"],
        }
    stars = []
    for row in csv.DictReader(io.StringIO(raw_hyg.decode("utf-8"))):
        sid = int(row["id"])
        magnitude = number(row["mag"])
        ra, dec = number(row["ra"]), number(row["dec"])
        if sid == 0 or magnitude is None or magnitude > 6.5 or ra is None or dec is None:
            continue
        ci = number(row["ci"])
        distance = number(row["dist"])
        luminosity = number(row["lum"])
        # HYG uses 100000 parsecs as a nonphysical placeholder for missing distances.
        distance = distance * 3.261563777 if distance is not None and 0 < distance < 100000 else None
        if distance is None:
            luminosity = None
        temperature = None
        if ci is not None and -0.4 <= ci <= 2.5:
            temperature = round(4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62)))
        # HYG luminosity is visual, not bolometric. This is only a size proxy for illustration.
        radius = round(math.sqrt(luminosity) * (5772 / temperature) ** 2, 2) if luminosity and temperature else None
        proper = row["proper"].strip()
        latin = proper or row["bf"].strip() or (f"HIP {row['hip']}" if row["hip"] else f"HYG {sid}")
        name = STAR_NAMES.get(proper, latin)
        constellation = NAMES.get(row["con"], "这片天空")
        description, sources = FEATURED.get(proper, (f"位于{constellation}。星表光谱为 {row['spect'] or '尚无资料'}；颜色主要由 B−V 色指数映射。", []))
        star = {
            "id": sid, "name": name, "latinName": latin, "ra": round((ra * 15) % 360, 6), "dec": dec,
            "magnitude": magnitude, "colorIndex": ci, "distanceLy": round(distance, 2) if distance else None,
            "spectralType": row["spect"].strip() or "未知", "luminositySolar": round(luminosity, 4) if luminosity else None,
            "constellation": row["con"],
            "temperatureK": temperature, "radiusSolar": radius, "massSolar": None, "rotationKmS": None,
            "description": description + " 温度由色指数估算，半径为视觉光度推算的教学近似；表面纹理与动画是示意。",
            "sourceUrls": [HYG_SOURCE, BALL_SOURCE] + sources,
        }
        if row["hip"].strip():
            star["hip"] = int(row["hip"])
        if proper == "Betelgeuse":
            star.update(temperatureK=3600, radiusSolar=700, massSolar=15,
                        description=description + " 温度、大小与质量采用 NASA 的科普近似；距离和星等仍为 HYG 目录快照，表面纹理是示意。")
        elif proper == "Achernar":
            star.update(radiusSolar=12, massSolar=6,
                        description=description + " 此处半径特指该模型赤道半径，温度仍由色指数估算；自转动画为示意。")
        elif proper == "Altair":
            star.update(rotationKmS=314, radiusSolar=2.008, massSolar=1.86,
                        description=description + " 半径、质量与自转速度采用论文模型估计，温度由色指数估算；动画不代表真实时间倍率。")
        elif proper == "Vega":
            star.update(rotationKmS=195,
                        description=description + " 赤道速度约 195 km/s，来自 2021 年光谱模型。温度与半径为教学近似，动画为示意。")
            star["sourceUrls"].append(VEGA_PAPER)
        stars.append(star)
    result = {
        "schemaVersion": 1, "epoch": "J2000.0", "limitingMagnitude": 6.5,
        "sourceCommits": {"hyg": HYG_COMMIT, "d3Celestial": D3_COMMIT},
        "sourceSha256": {key: hashlib.sha256(value).hexdigest() for key, value in {
            "hygdata_v41.csv": raw_hyg, "constellations.json": raw_names,
            "constellations.lines.json": raw_lines, "constellations.bounds.json": raw_bounds,
        }.items()},
        "licenses": {"stars": "CC-BY-SA-4.0", "constellationGeometry": "BSD-3-Clause"},
        "stars": sorted(stars, key=lambda star: (star["magnitude"], star["id"])),
        "constellations": sorted(constellations.values(), key=lambda constellation: constellation["rank"]),
        "sources": SOURCES,
    }
    validate(result)
    return result


def validate(data):
    assert data["schemaVersion"] == 1 and data["epoch"] == "J2000.0"
    assert len(data["stars"]) > 7000
    assert len(data["constellations"]) == 88
    assert {constellation["id"] for constellation in data["constellations"]} == set(NAMES)
    assert {constellation["rank"] for constellation in data["constellations"]} == set(range(1, 89))
    assert len({star["id"] for star in data["stars"]}) == len(data["stars"])
    assert {constellation["id"] for constellation in data["constellations"] if constellation["zodiac"]} == ZODIAC
    assert len(ZODIAC) == 13
    assert abs(sum(constellation["area"] for constellation in data["constellations"]) - 41252.96) < 5
    for constellation in data["constellations"]:
        assert constellation["name"] and constellation["latinName"]
        assert constellation["area"] > 0 and constellation["lines"]
        assert 0 <= constellation["ra"] < 360 and -90 <= constellation["dec"] <= 90
        assert constellation["season"] in {"spring", "summer", "autumn", "winter", "south"}
        for line in constellation["lines"]:
            assert len(line) >= 2
            for ra, dec in line:
                assert 0 <= ra < 360 and -90 <= dec <= 90
    for star in data["stars"]:
        assert star["name"] and star["sourceUrls"] and star["description"]
        if "hip" in star:
            assert isinstance(star["hip"], int) and star["hip"] > 0
        assert 0 <= star["ra"] < 360 and -90 <= star["dec"] <= 90
        assert -2 < star["magnitude"] <= 6.5
        for field in ["distanceLy", "luminositySolar", "temperatureK", "radiusSolar", "massSolar", "rotationKmS"]:
            value = star[field]
            assert value is None or (math.isfinite(value) and value > 0), (star["name"], field, value)
    by_name = {star["latinName"]: star for star in data["stars"]}
    assert by_name["Sirius"]["hip"] == 32349
    assert by_name["Sirius"]["magnitude"] < by_name["Vega"]["magnitude"]
    assert by_name["Rigel"]["colorIndex"] < by_name["Betelgeuse"]["colorIndex"]
    assert by_name["Betelgeuse"]["radiusSolar"] > 100 * by_name["Sirius"]["radiusSolar"]
    assert by_name["Altair"]["rotationKmS"] == 314
    assert by_name["Vega"]["rotationKmS"] == 195
    print(f"Validated {len(data['stars'])} stars, 88 constellations, 13 astronomical ecliptic constellations.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Download pinned upstream data and replace catalog.json")
    args = parser.parse_args()
    if args.write:
        data = build()
        OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"Wrote {OUTPUT.name}: {OUTPUT.stat().st_size:,} bytes")
    else:
        validate(json.loads(OUTPUT.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
