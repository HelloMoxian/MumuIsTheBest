# 仰望星空：目录与科学边界

目录包含 **8,920 颗视星等不暗于 6.5 等的恒星、88 个 IAU 现代星座**。所有数据随产品打包，页面运行时不请求天文服务。内容不包含任何用户位置或其他个人数据。

## 数据与授权

### HYG 4.1 恒星

- 作者：David Nash / Astronexus；汇编 Hipparcos、Yale Bright Star Catalog 和 Gliese 等公开星表。
- [项目与字段说明](https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md)
- 固定提交：`c7f7f883fe678cc7680169a50ccd7dcc49b060ce`，文件 `hyg/CURRENT/hygdata_v41.csv`。
- 授权：[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)。本目录中的 HYG 派生恒星数据同样按 **CC BY-SA 4.0** 提供；此声明不改变其他独立应用代码的许可。
- 改动：筛选视星等 ≤ 6.5；去掉太阳；赤经小时转角度；秒差距转光年；保留 HYG 稳定 ID；添加中文显示名与教学说明；推算色温及尺寸代理；补充少量有来源的研究参数。所有数值经适度舍入。

### 星座图形

- 作者：Olaf Frohn / d3-celestial。
- [项目](https://github.com/ofrohn/d3-celestial)、[数据格式与来源说明](https://ofrohn.github.io/data/)。
- 固定提交：`7e720a3de062059d4c5400a379146a601d9010e0`。
- 使用 `constellations.json`、`constellations.lines.json`、`constellations.bounds.json`，授权为 **BSD-3-Clause**，完整声明见文末。
- 上游根据 [IAU 星座资料](https://iauarchive.eso.org/public/themes/constellations/)整理星座名和连线，边界来源为 Davenhall & Leggett (1989), VizieR VI/49。中文名称为常用简体中文形式；室女座、宝瓶座、人马座在说明中保留处女座、水瓶座、射手座这些常用别称。
- 改动：经度从 −180…180 转为赤经 0…360 度；保留每条折线的全部顶点；将巨蛇座蛇头、蛇尾两片合并为一个 `Ser`；添加中文说明、推荐顺序、季节分组。星座中心是便于取景的标注点，不是物理中心。
- 面积为边界顶点构成的球面多边形面积，按平方度保留一位小数；由于边界曲线离散化，与正式表中面积会有小差别。88 座总和约为完整天球的 41,253 平方度。

## 可以如何解释这些数据

1. **位置**：恒星与连线均采用 J2000.0 赤道坐标。并未加入岁差、自行、光行差、视差、大气折射或地平遮挡，所以是教学星图，不是精密望远镜寻星或当前当地可见性预测。
2. **星等**：使用 HYG 单一目录快照。数字越小通常表示从地球看越亮；变星的实际亮度会变化，目录星等并非实时测量。
3. **距离**：HYG 的 `dist` 以秒差距记录，乘以 `3.261563777` 转成光年。`100000` 秒差距占位值，以及非正或缺失值转换为 `null`；其对应相对光度也清空。部分明亮远星的距离不确定性较大；没有把不同研究的距离与星等随意拼接。
4. **颜色**：主要参考实测 B−V 色指数。较小、负的指数通常偏蓝白；较大的正值通常偏黄、橙、红。显示器上的饱和颜色是帮助辨识的表达，肉眼暗视时颜色会弱得多。星际尘埃、双星和测量误差也会影响颜色。蓝色恒星一般比红色恒星表面更热。
5. **温度**：除注明的精选星外，根据 [Ballesteros (2012)](https://arxiv.org/abs/1201.1809) 的黑体色温近似计算：`T = 4600 × [1 / (0.92(B−V)+1.7) + 1 / (0.92(B−V)+0.62)]`，仅在 `−0.4 ≤ B−V ≤ 2.5` 使用。这是近似色温，不是完整恒星大气模型给出的精确有效温度。
6. **光度与尺寸**：HYG `lum` 是由绝对视觉星等推算的相对光度；不能当作精确全波段光度。通用 `radiusSolar = sqrt(lum) × (5772 / temperatureK)²` 因未作总辐射改正，仅是用于区分示意球体大小的**教学尺寸代理**，不能声称实测半径。热星、红星、双星和巨星可能偏差明显。显示时应标“大小估计/示意”，不能称精确比例复原。
7. **质量与旋转**：不从颜色随意猜质量或自转速度；未收录可靠参数时使用 `null`。`rotationKmS` 有值时是研究给出的近似赤道速度，不混入径向速度或 `v sin i`。动画速度始终是压缩后的示意，不是恒星真实自转周期。
8. **图案与排名**：IAU 定义的是覆盖全天的 88 个区域，没有规定唯一连线图案。北斗七星与夏季大三角是星群图案，不能说成第 89 个正式星座。`zodiac` 标记天文学上黄道经过的 **13 个现代星座，包含蛇夫座**；它不同于传统的十二星座名称。推荐排名是面向中文家庭的编辑选择，依据熟悉程度、亮星和辨识难易排序，**不是官方知名度或访问量统计**。
9. **季节**：北半球中纬度晚间观星的粗略目录分组（赤经 3–9 时冬、9–15 时春、15–21 时夏，其余秋；中心赤纬小于 −45° 归南天）。它不承诺此刻、任何纬度或任何时区都可见；拱极星座也并非只在一个季节出现。
10. **表面画面**：局部纹理、耀斑、星斑、鼓起幅度和动画只能作为解释性视觉，不是该星表面的照片或确定地图。恒星不能被绘成绿色物理光球。

## 精选恒星资料

25 颗亮星有独立说明，中文显示名另外覆盖北斗七星、猎户腰带和常见导航亮星。未命名目标使用 HYG 中的通用名、拜耳/佛氏名称或 HIP/HYG 编号。下列补充是对资料的简短中文改写，不下载或再发布来源照片。

| 恒星或主题 | 使用内容 | 来源 |
| --- | --- | --- |
| 天狼星 | 夜空最亮恒星、白矮星伴星 | [NASA / Hubble](https://science.nasa.gov/asset/hubble/the-dog-star-sirius-and-its-tiny-companion/) |
| 参宿四 | 红超巨星；约 3600 K、约 700 个太阳半径、约 15 个太阳质量 | [NASA 科普](https://science.nasa.gov/universe/what-is-betelgeuse-inside-the-strange-volatile-star/) |
| 猎户座恒星颜色 | 参宿四偏红与其他亮星偏蓝的温度关联 | [NASA APOD](https://apod.nasa.gov/apod/ap980829.html) |
| 牛郎星 | 2020 年二维模型：赤道速度约 314 km/s，赤道半径 2.008 个太阳半径，质量约 1.86 个太阳质量 | [Bouchaud et al., A&A (2020)](https://www.aanda.org/articles/aa/full_html/2020/01/aa36830-19/aa36830-19.html) |
| 织女星 | 赤道速度约 195 ± 15 km/s；不等于约 21.6 km/s 的投影速度 | [Takeda, MNRAS (2021)](https://academic.oup.com/mnras/article/505/2/1905/6276737) |
| 水委一 | 2003 年模型：赤道半径约 12 个太阳半径，质量约 6 个太阳质量；示例历史研究，并非最新精确参数 | [ESO](https://www.eso.org/public/news/eso0316/) |
| 心宿二 | 橙红色超巨星、已获得表面与大气干涉观测 | [ESO](https://www.eso.org/public/news/eso1726/) |
| 轩辕十四等快转星 | 旋转扁率、赤道相对变暗 | [CHARA](https://chara.gsu.edu/science-highlights/rapid-rotators) |
| 夏季大三角 | 织女星、牛郎星、天津四分别属于不同星座 | [NASA](https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-altair/) |
| 其余精选恒星 | 星座归属、目录光谱、色指数、距离和明亮程度；不添加未核验的质量、自转数字 | [HYG 4.1](https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md)、[NASA 恒星类型](https://science.nasa.gov/universe/stars/types/) |

## 重建与校验

生成器为仓库中的 `scripts/build-stargazing-catalog.py`，仅用 Python 标准库。默认运行只校验已打包数据；`--write` 下载上述固定提交并生成 `catalog.json`，必须遵循仓库的逐文件编辑记录要求。JSON 内保存原始下载内容的 SHA-256，可追溯固定输入。生成器不缓存或写出上游大文件。

校验包括：88 个唯一 IAU 缩写、完整 1–88 推荐顺序、包含蛇夫座的 13 个天文学黄道星座、全部星座非空折线、所有坐标范围、全天面积和、8,920 个唯一恒星 ID、有效或明确缺失的数值、天狼星/织女星亮度关系、参宿七/参宿四色指数关系、巨星/天狼星尺寸层级、两颗精选快转星参数。数据不自动在线更新，更新需重新检查授权、字段语义和显示规则。

## d3-celestial BSD-3-Clause 原始授权

Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
