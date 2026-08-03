import { RHYME_CHAPTER_FIVE } from "./chapter-five";
import { RHYME_CHAPTER_FOUR } from "./chapter-four";
import { RHYME_CHAPTER_THREE } from "./chapter-three";

export type RhymeTerm = {
  word: string;
  pinyin: string;
  meaning: string;
};

export type RhymeSentence = {
  id: string;
  text: string;
  pinyin: string;
  meaning: string;
  terms: readonly RhymeTerm[];
  pairing: string;
  storyTitle: string;
  story: string;
};

export type RhymeSection = {
  title: string;
  sentences: readonly RhymeSentence[];
};

export type AnnotatedRhymeChapter = {
  id: string;
  title: string;
  volume: "上卷" | "下卷";
  focus: string;
  sections: readonly RhymeSection[];
};

export const RHYME_CHAPTERS = [
  ...["一东", "二冬", "三江", "四支", "五微", "六鱼", "七虞", "八齐", "九佳", "十灰", "十一真", "十二文", "十三元", "十四寒", "十五删"].map((title, index) => ({
    id: `upper-${index + 1}`,
    title,
    volume: "上卷" as const,
    annotated: index < 5,
  })),
  ...["一先", "二萧", "三肴", "四豪", "五歌", "六麻", "七阳", "八庚", "九青", "十蒸", "十一尤", "十二侵", "十三覃", "十四盐", "十五咸"].map((title, index) => ({
    id: `lower-${index + 1}`,
    title,
    volume: "下卷" as const,
    annotated: false,
  })),
] as const;

const NO_STORY_TITLE = "这句没有专门故事";

export const RHYME_ANNOTATED_CHAPTERS: readonly AnnotatedRhymeChapter[] = [
  {
    id: "upper-1",
    title: "一东",
    volume: "上卷",
    focus: "从风雨、花木和人物故事里，发现词语怎样两两相照。",
    sections: [
      {
        title: "第一则 · 天地与行旅",
        sentences: [
          {
            id: "dong-1-1",
            text: "云对雨，雪对风，晚照对晴空。",
            pinyin: "yún duì yǔ，xuě duì fēng，wǎn zhào duì qíng kōng。",
            meaning: "云和雨常常相伴，雪和风都是天气景象；晚照是傍晚的阳光，晴空是晴朗的天空。",
            terms: [
              { word: "晚照", pinyin: "wǎn zhào", meaning: "傍晚的阳光，也可以理解为夕阳的余晖。" },
              { word: "晴空", pinyin: "qíng kōng", meaning: "晴朗、明净的天空。" },
            ],
            pairing: "云、雨、雪、风都来自天空；晚照写天空中的光，晴空写天空本身。作者把同一幅大自然画面里的景物配成了对子。",
            storyTitle: NO_STORY_TITLE,
            story: "这句主要带我们观察天气和天空，不需要另外寻找人物典故。",
          },
          {
            id: "dong-1-2",
            text: "来鸿对去燕，宿鸟对鸣虫。",
            pinyin: "lái hóng duì qù yàn，sù niǎo duì míng chóng。",
            meaning: "飞来的大雁对飞去的燕子，停下来休息的鸟儿对正在鸣叫的小虫。",
            terms: [
              { word: "来鸿", pinyin: "lái hóng", meaning: "飞来的大雁。鸿，在这里指大雁。" },
              { word: "去燕", pinyin: "qù yàn", meaning: "飞去的燕子。去，与“来”相对。" },
              { word: "宿鸟", pinyin: "sù niǎo", meaning: "夜里停在树上或巢中休息的鸟。" },
              { word: "鸣虫", pinyin: "míng chóng", meaning: "会发出叫声的小虫，例如蟋蟀。" },
            ],
            pairing: "大雁和燕子都是飞鸟，一个来、一个去；鸟儿安静栖息，小虫发声鸣叫。画面里既有移动，也有停留。",
            storyTitle: NO_STORY_TITLE,
            story: "古人常从候鸟的来去判断季节。这一句更像一幅有远有近、也有声音的自然小画。",
          },
          {
            id: "dong-1-3",
            text: "三尺剑，六钧弓，岭北对江东。",
            pinyin: "sān chǐ jiàn，liù jūn gōng，lǐng běi duì jiāng dōng。",
            meaning: "三尺长的剑对需要很大力气拉开的弓，山岭以北对长江以东。",
            terms: [
              { word: "三尺剑", pinyin: "sān chǐ jiàn", meaning: "古人对长剑的一种说法，不必当作精确尺寸。" },
              { word: "六钧弓", pinyin: "liù jūn gōng", meaning: "很有力量的硬弓。钧是古代重量单位。" },
              { word: "岭北", pinyin: "lǐng běi", meaning: "山岭以北的地方。" },
              { word: "江东", pinyin: "jiāng dōng", meaning: "古人常用来称长江下游以东的一片地区。" },
            ],
            pairing: "剑和弓都是古代兵器；岭北和江东都是用山川方向来称呼的地方。一个对子从手中的器物写到辽阔的地理。",
            storyTitle: "古人的方向名字",
            story: "古人常借大山和大江说明方位，所以“岭北”“江东”不只是东南西北，也像今天说“江南”“塞北”一样带着地域画面。",
          },
          {
            id: "dong-1-4",
            text: "人间清暑殿，天上广寒宫。",
            pinyin: "rén jiān qīng shǔ diàn，tiān shàng guǎng hán gōng。",
            meaning: "人间有供帝王消暑的清暑殿，天上有传说中的月宫广寒宫。",
            terms: [
              { word: "清暑殿", pinyin: "qīng shǔ diàn", meaning: "古代宫殿名称，可以理解为夏天避暑的宫殿。" },
              { word: "广寒宫", pinyin: "guǎng hán gōng", meaning: "古代神话中月亮上的宫殿，常与嫦娥、玉兔的故事相连。" },
            ],
            pairing: "人间对天上，现实中的皇家宫殿对想象中的月亮宫殿；“暑”和“寒”又让人感到一热一冷。",
            storyTitle: "地上的宫殿与月宫",
            story: "常见注本把清暑殿解释为东晋孝武帝在建康修建的宫殿。广寒宫则来自古人对月亮的神话想象。一个可在人间寻找，一个只能在故事里遨游。",
          },
          {
            id: "dong-1-5",
            text: "两岸晓烟杨柳绿，一园春雨杏花红。",
            pinyin: "liǎng àn xiǎo yān yáng liǔ lǜ，yì yuán chūn yǔ xìng huā hóng。",
            meaning: "清晨薄雾笼着河岸，杨柳一片碧绿；春雨落进园中，杏花开得红艳。",
            terms: [
              { word: "晓烟", pinyin: "xiǎo yān", meaning: "清晨像轻烟一样的雾气。" },
              { word: "春雨", pinyin: "chūn yǔ", meaning: "春天柔和的雨水。" },
              { word: "杨柳", pinyin: "yáng liǔ", meaning: "枝条细长柔软的柳树。" },
              { word: "杏花", pinyin: "xìng huā", meaning: "杏树在春天开放的花，常见白色或淡粉色。" },
            ],
            pairing: "两岸对一园，清晨薄雾对春日细雨，绿色杨柳对红色杏花。两边都是春天，却从不同地点和颜色来描画。",
            storyTitle: NO_STORY_TITLE,
            story: "这句没有特定人物故事，它用雾、雨、柳、花组成了一幅清润的春景。",
          },
          {
            id: "dong-1-6",
            text: "两鬓风霜，途次早行之客；一蓑烟雨，溪边晚钓之翁。",
            pinyin: "liǎng bìn fēng shuāng，tú cì zǎo xíng zhī kè；yì suō yān yǔ，xī biān wǎn diào zhī wēng。",
            meaning: "清早赶路的旅人两鬓沾着风霜；傍晚垂钓的老人披着蓑衣，站在烟雨溪边。",
            terms: [
              { word: "两鬓", pinyin: "liǎng bìn", meaning: "脸旁靠近耳朵的头发。" },
              { word: "一蓑", pinyin: "yì suō", meaning: "一件蓑衣；蓑是古人用草或棕叶编成的雨衣。" },
              { word: "途次", pinyin: "tú cì", meaning: "旅途中、赶路的时候。" },
              { word: "溪边", pinyin: "xī biān", meaning: "小溪旁边，是老人垂钓的地方。" },
            ],
            pairing: "清早赶路的客人对傍晚钓鱼的老人；风霜对烟雨，路上对溪边。两幅画都有天气，也都有在户外活动的人。",
            storyTitle: "像两幅连在一起的画",
            story: "上半幅是匆匆赶路，下半幅是静静垂钓。一个“早”、一个“晚”，让一天的时间也互相照应。",
          },
        ],
      },
      {
        title: "第二则 · 人物与故事",
        sentences: [
          {
            id: "dong-2-1",
            text: "沿对革，异对同，白叟对黄童。",
            pinyin: "yán duì gé，yì duì tóng，bái sǒu duì huáng tóng。",
            meaning: "沿是继续原来的样子，革是改变；异是不同，同是相同；白发老人对年幼儿童。",
            terms: [
              { word: "沿", pinyin: "yán", meaning: "沿用、继续原来的做法。" },
              { word: "革", pinyin: "gé", meaning: "改变、变革。" },
              { word: "白叟", pinyin: "bái sǒu", meaning: "头发花白的老人。叟，就是老人。" },
              { word: "黄童", pinyin: "huáng tóng", meaning: "年幼的孩子，是古人的一种称呼。" },
            ],
            pairing: "沿和革是一成不变与发生改变，异和同是不同与相同，老人和儿童又代表人生的两端。",
            storyTitle: NO_STORY_TITLE,
            story: "这句用三组容易比较的词帮助孩子发现“相反”和“相照”的关系。",
          },
          {
            id: "dong-2-2",
            text: "江风对海雾，牧子对渔翁。",
            pinyin: "jiāng fēng duì hǎi wù，mù zǐ duì yú wēng。",
            meaning: "江面上的风对海上的雾，放牧的孩子对捕鱼的老人。",
            terms: [
              { word: "牧子", pinyin: "mù zǐ", meaning: "帮助放牛、放羊的孩子。" },
              { word: "渔翁", pinyin: "yú wēng", meaning: "年长的捕鱼人。" },
            ],
            pairing: "江和海都是水域，风和雾都是水边常见的景象；牧子在陆地放牧，渔翁在水边捕鱼。",
            storyTitle: NO_STORY_TITLE,
            story: "这句把辽阔的江海放在远处，又把劳动的人放在近处，画面一下子有了生活气息。",
          },
          {
            id: "dong-2-3",
            text: "颜巷陋，阮途穷，冀北对辽东。",
            pinyin: "yán xiàng lòu，ruǎn tú qióng，jì běi duì liáo dōng。",
            meaning: "颜回住的巷子很简陋，阮籍驾车走到无路可走；冀北和辽东是两个古代地域名称。",
            terms: [
              { word: "颜巷", pinyin: "yán xiàng", meaning: "颜回居住的简陋街巷。颜回生活清苦，却仍然热爱学习。" },
              { word: "阮途", pinyin: "ruǎn tú", meaning: "阮籍出行时遇到的道路。相传他走到路尽头会难过而返。" },
              { word: "冀北", pinyin: "jì běi", meaning: "古代冀州北部一带。" },
              { word: "辽东", pinyin: "liáo dōng", meaning: "辽河以东的一片古代地域。" },
            ],
            pairing: "颜巷和阮途都借地点讲人物故事；冀北和辽东则都是北方地域。巷、路、地域由近到远地展开。",
            storyTitle: "颜回和阮籍",
            story: "孔子的学生颜回家境清苦，仍能安心学习。魏晋名士阮籍驾车时常随意而行，到了无路可走的地方便返回。这里用短短三个字各藏进一个人物故事。",
          },
          {
            id: "dong-2-4",
            text: "池中濯足水，门外打头风。",
            pinyin: "chí zhōng zhuó zú shuǐ，mén wài dǎ tóu fēng。",
            meaning: "池中有可以洗脚的水，门外吹来迎面扑向头脸的风。",
            terms: [
              { word: "濯足", pinyin: "zhuó zú", meaning: "洗脚。濯，就是洗。" },
              { word: "打头风", pinyin: "dǎ tóu fēng", meaning: "迎面吹来的风，也叫顶头风。" },
            ],
            pairing: "池中对门外，脚下的水对迎面的风。一个让人感到清凉，一个让人感到阻力。",
            storyTitle: "水清时可以洗一洗",
            story: "古歌里有“水清可以洗帽带，水浊可以洗脚”的说法。这里主要借“濯足水”写水在脚边流动的感觉。",
          },
          {
            id: "dong-2-5",
            text: "梁帝讲经同泰寺，汉皇置酒未央宫。",
            pinyin: "liáng dì jiǎng jīng tóng tài sì，hàn huáng zhì jiǔ wèi yāng gōng。",
            meaning: "梁武帝在同泰寺讲说佛经，汉代皇帝在未央宫安排宴席。",
            terms: [
              { word: "同泰寺", pinyin: "tóng tài sì", meaning: "南朝梁都城建康的一座寺院。" },
              { word: "未央宫", pinyin: "wèi yāng gōng", meaning: "汉代长安著名的宫殿建筑群。" },
              { word: "讲经", pinyin: "jiǎng jīng", meaning: "讲说、解释经典。" },
              { word: "置酒", pinyin: "zhì jiǔ", meaning: "准备宴席招待宾客。" },
            ],
            pairing: "梁代皇帝对汉代皇帝，同泰寺对未央宫，讲经对设宴。两边都有皇帝、著名建筑和重要活动。",
            storyTitle: "寺院讲经与宫中宴会",
            story: "梁武帝十分尊崇佛教，常到同泰寺讲经。未央宫是汉代重要宫殿，许多朝会和宴席在那里举行。这里把两个朝代的皇家场景放在一起。",
          },
          {
            id: "dong-2-6",
            text: "尘虑萦心，懒抚七弦绿绮；霜华满鬓，羞看百炼青铜。",
            pinyin: "chén lǜ yíng xīn，lǎn fǔ qī xián lǜ qǐ；shuāng huá mǎn bìn，xiū kàn bǎi liàn qīng tóng。",
            meaning: "心里被许多烦恼缠绕，连名琴也不想弹；两鬓已经像霜一样白，不愿照见铜镜中的自己。",
            terms: [
              { word: "尘虑", pinyin: "chén lǜ", meaning: "生活中纷纷扰扰的烦恼。" },
              { word: "绿绮", pinyin: "lǜ qǐ", meaning: "古代名琴，后来也常用来代指琴。" },
              { word: "霜华", pinyin: "shuāng huá", meaning: "这里比喻白发像白霜。" },
              { word: "青铜", pinyin: "qīng tóng", meaning: "这里指古人用打磨光亮的铜制成的镜子。" },
            ],
            pairing: "心中烦恼对容貌衰老，名琴对铜镜，不想弹琴对不愿照镜。两边都写人在忧愁时提不起精神。",
            storyTitle: "琴与铜镜",
            story: "古人没有玻璃镜时，会把铜磨得光亮来照面容。“绿绮”本是一张名琴，这里让琴声和镜中白发共同表达心事。",
          },
        ],
      },
      {
        title: "第三则 · 春色与人物",
        sentences: [
          {
            id: "dong-3-1",
            text: "贫对富，塞对通，野叟对溪童。",
            pinyin: "pín duì fù，sè duì tōng，yě sǒu duì xī tóng。",
            meaning: "贫穷对富有，堵塞对通畅，野外的老人对溪边的孩子。",
            terms: [
              { word: "塞", pinyin: "sè", meaning: "这里读“色”，表示堵住、不通。" },
              { word: "通", pinyin: "tōng", meaning: "没有阻碍，可以顺利通过。" },
              { word: "野叟", pinyin: "yě sǒu", meaning: "居住或活动在乡野的老人。" },
              { word: "溪童", pinyin: "xī tóng", meaning: "溪水边的孩子。" },
            ],
            pairing: "贫和富、塞和通都是意思相反的词；老人和孩子代表不同年龄，乡野和溪边又组成自然环境。",
            storyTitle: NO_STORY_TITLE,
            story: "这句从生活状况、道路状态写到乡野人物，用三组清楚的比较帮助理解对子。",
          },
          {
            id: "dong-3-2",
            text: "鬓皤对眉绿，齿皓对唇红。",
            pinyin: "bìn pó duì méi lǜ，chǐ hào duì chún hóng。",
            meaning: "花白的鬓发对古人描画的青绿色眉毛，洁白的牙齿对红润的嘴唇。",
            terms: [
              { word: "鬓皤", pinyin: "bìn pó", meaning: "鬓发变得花白。皤，就是白。" },
              { word: "眉绿", pinyin: "méi lǜ", meaning: "古人有时用青绿色颜料画眉，因此这样形容好看的眉毛。" },
              { word: "齿皓", pinyin: "chǐ hào", meaning: "牙齿洁白。皓，就是明亮洁白。" },
              { word: "唇红", pinyin: "chún hóng", meaning: "嘴唇颜色红润。" },
            ],
            pairing: "鬓发和眉毛都在脸的上部，牙齿和嘴唇相邻；白、绿、红又让人物形象带上鲜明颜色。",
            storyTitle: "古人的颜色称呼",
            story: "“眉绿”并不是说眉毛天然是绿色，而是和古代妆饰习惯有关。读古文时，要把词语放回古人的生活中理解。",
          },
          {
            id: "dong-3-3",
            text: "天浩浩，日融融，佩剑对弯弓。",
            pinyin: "tiān hào hào，rì róng róng，pèi jiàn duì wān gōng。",
            meaning: "天空广大无边，阳光温暖和煦；佩在身边的剑对拉弯的弓。",
            terms: [
              { word: "浩浩", pinyin: "hào hào", meaning: "广大、无边无际的样子。" },
              { word: "融融", pinyin: "róng róng", meaning: "温暖和乐的样子。" },
              { word: "佩剑", pinyin: "pèi jiàn", meaning: "佩带在身边的剑。" },
              { word: "弯弓", pinyin: "wān gōng", meaning: "拉弯的弓，也可指弯曲形状的弓。" },
            ],
            pairing: "广阔天空对温暖太阳，长剑对弯弓。前半句是辽阔明亮的景象，后半句是两种古代器物。",
            storyTitle: NO_STORY_TITLE,
            story: "“浩浩”“融融”读起来像把景物慢慢铺开，一个写大，一个写暖。",
          },
          {
            id: "dong-3-4",
            text: "半溪流水绿，千树落花红。",
            pinyin: "bàn xī liú shuǐ lǜ，qiān shù luò huā hóng。",
            meaning: "溪水映着绿意，仿佛半条溪都是绿色；许多树的红花飘落下来。",
            terms: [
              { word: "半溪", pinyin: "bàn xī", meaning: "半条溪流，也是在说眼前一片溪水。" },
              { word: "千树", pinyin: "qiān shù", meaning: "形容树木非常多，不一定正好是一千棵。" },
            ],
            pairing: "半溪对千树，流水对落花，绿色对红色。一边是水在流，一边是花在落，整幅画都在轻轻运动。",
            storyTitle: NO_STORY_TITLE,
            story: "古诗里的数字有时是为了表现多少和画面，不一定需要真的数到一千。",
          },
          {
            id: "dong-3-5",
            text: "野渡燕穿杨柳雨，芳池鱼戏芰荷风。",
            pinyin: "yě dù yàn chuān yáng liǔ yǔ，fāng chí yú xì jì hé fēng。",
            meaning: "野外渡口，燕子从杨柳细雨中穿过；芳香池塘里，鱼儿在菱叶、荷叶间迎风嬉游。",
            terms: [
              { word: "野渡", pinyin: "yě dù", meaning: "乡野间供人过河的渡口。" },
              { word: "芳池", pinyin: "fāng chí", meaning: "花草芬芳、景色优美的池塘。" },
              { word: "燕穿", pinyin: "yàn chuān", meaning: "燕子轻快地穿飞而过。" },
              { word: "鱼戏", pinyin: "yú xì", meaning: "鱼儿来回游动，像在玩耍。" },
            ],
            pairing: "渡口对池塘，燕子对鱼儿，杨柳雨对芰荷风。一个在空中穿飞，一个在水中游动。",
            storyTitle: NO_STORY_TITLE,
            story: "这句把视线从雨中的燕子移到荷叶下的鱼儿，好像镜头从天空慢慢落到水里。",
          },
          {
            id: "dong-3-6",
            text: "女子眉纤，额下现一弯新月；男儿气壮，胸中吐万丈长虹。",
            pinyin: "nǚ zǐ méi xiān，é xià xiàn yì wān xīn yuè；nán ér qì zhuàng，xiōng zhōng tǔ wàn zhàng cháng hóng。",
            meaning: "古人把女子纤细的眉毛比作弯弯新月，又把男子豪迈的志气比作直上长空的彩虹。",
            terms: [
              { word: "眉纤", pinyin: "méi xiān", meaning: "眉毛细长。纤，就是细。" },
              { word: "气壮", pinyin: "qì zhuàng", meaning: "气概豪迈，充满力量。" },
              { word: "新月", pinyin: "xīn yuè", meaning: "月初时细细弯弯的月亮。" },
              { word: "长虹", pinyin: "cháng hóng", meaning: "长长的彩虹，这里比喻豪迈的志气。" },
            ],
            pairing: "细眉对豪气，新月对长虹，额下对胸中。一个形象纤细，一个气势开阔。",
            storyTitle: "这是古人的人物想象",
            story: "古书常用柔美形容女子、豪迈形容男子。这是当时的表达习惯，不是今天给孩子的限制：女孩和男孩都可以温柔，也都可以勇敢、有志气。",
          },
        ],
      },
    ],
  },
  {
    id: "upper-2",
    title: "二冬",
    volume: "上卷",
    focus: "从四季、花鸟、名山和古人故事里，看见一组组相映的画面。",
    sections: [
      {
        title: "第一则 · 四季与山川",
        sentences: [
          {
            id: "dong2-1-1",
            text: "春对夏，秋对冬，暮鼓对晨钟。",
            pinyin: "chūn duì xià，qiū duì dōng，mù gǔ duì chén zhōng。",
            meaning: "春天对夏天，秋天对冬天；傍晚的鼓声对清晨的钟声。",
            terms: [
              { word: "暮鼓", pinyin: "mù gǔ", meaning: "傍晚报时或寺院传来的鼓声。" },
              { word: "晨钟", pinyin: "chén zhōng", meaning: "清晨报时或寺院传来的钟声。" },
            ],
            pairing: "春夏秋冬组成一年四季；傍晚和清晨是一天的两端，鼓声和钟声都能提醒人们时间。",
            storyTitle: "古人的报时声音",
            story: "没有手机和闹钟的时候，人们会借钟鼓知道时间。“暮鼓晨钟”也让人想到寺院里从早到晚的生活节奏。",
          },
          {
            id: "dong2-1-2",
            text: "观山对玩水，绿竹对苍松。",
            pinyin: "guān shān duì wán shuǐ，lǜ zhú duì cāng sōng。",
            meaning: "观赏山景对游赏水景，翠绿的竹子对深青色的松树。",
            terms: [
              { word: "观山", pinyin: "guān shān", meaning: "观看、欣赏山景。" },
              { word: "玩水", pinyin: "wán shuǐ", meaning: "这里的“玩”是欣赏、游赏，不是独自到水里玩耍。" },
              { word: "绿竹", pinyin: "lǜ zhú", meaning: "颜色青翠的竹子。" },
              { word: "苍松", pinyin: "cāng sōng", meaning: "颜色深青、长得挺拔的松树。" },
            ],
            pairing: "山和水是常见的自然搭档，竹和松都四季常青。两组词一起组成清雅的山水风景。",
            storyTitle: "读古文也要注意安全",
            story: "这里的“玩水”是古人说的欣赏水景。小朋友真的到水边时，一定要有大人陪伴。",
          },
          {
            id: "dong2-1-3",
            text: "冯妇虎，叶公龙，舞蝶对鸣蛩。",
            pinyin: "féng fù hǔ，yè gōng lóng，wǔ dié duì míng qióng。",
            meaning: "会打虎的冯妇对嘴上喜爱龙的叶公；飞舞的蝴蝶对鸣叫的蟋蟀。",
            terms: [
              { word: "冯妇", pinyin: "féng fù", meaning: "古代故事中曾经徒手打虎的人。" },
              { word: "叶公", pinyin: "yè gōng", meaning: "“叶公好龙”故事里的主人公。" },
              { word: "舞蝶", pinyin: "wǔ dié", meaning: "上下翻飞、像在跳舞的蝴蝶。" },
              { word: "鸣蛩", pinyin: "míng qióng", meaning: "鸣叫的蟋蟀。蛩，常用来指蟋蟀。" },
            ],
            pairing: "冯妇的故事围绕虎，叶公的故事围绕龙；蝴蝶用动作写“舞”，蟋蟀用声音写“鸣”。",
            storyTitle: "真的勇敢与嘴上喜欢",
            story: "冯妇原来善于打虎，后来答应众人的请求再次出手；叶公到处画龙，却在真龙出现时吓跑了。“叶公好龙”提醒我们，嘴上喜欢和真正了解并不一样。",
          },
          {
            id: "dong2-1-4",
            text: "衔泥双紫燕，课蜜几黄蜂。",
            pinyin: "xián ní shuāng zǐ yàn，kè mì jǐ huáng fēng。",
            meaning: "一双燕子衔泥筑巢，几只黄蜂忙着采花酿蜜。",
            terms: [
              { word: "衔泥", pinyin: "xián ní", meaning: "用嘴含着泥，是燕子筑巢时常见的动作。" },
              { word: "课蜜", pinyin: "kè mì", meaning: "忙着采蜜、酿蜜。这里的“课”有操劳、进行工作的意思。" },
            ],
            pairing: "紫燕对黄蜂，一双对几只，衔泥筑巢对采花酿蜜。两边都是春日里忙碌的小动物。",
            storyTitle: NO_STORY_TITLE,
            story: "这句像在观察动物劳动：燕子一点点衔泥，黄蜂一次次访花，各自完成自己的小工程。",
          },
          {
            id: "dong2-1-5",
            text: "春日园中莺恰恰，秋天塞外雁雍雍。",
            pinyin: "chūn rì yuán zhōng yīng qià qià，qiū tiān sài wài yàn yōng yōng。",
            meaning: "春日园中黄莺叫声清脆，秋天塞外大雁成群鸣叫。",
            terms: [
              { word: "园中", pinyin: "yuán zhōng", meaning: "花园里面，是近处温暖的春日空间。" },
              { word: "塞外", pinyin: "sài wài", meaning: "古代边塞以外的广阔地区。" },
              { word: "莺恰恰", pinyin: "yīng qià qià", meaning: "黄莺发出清脆和谐的叫声。" },
              { word: "雁雍雍", pinyin: "yàn yōng yōng", meaning: "大雁发出和谐相应的鸣声。" },
            ],
            pairing: "春日对秋天，园中对塞外，黄莺对大雁。一个画面温暖近巧，一个画面辽阔高远。",
            storyTitle: "把鸟声写进文字",
            story: "“恰恰”和“雍雍”像是古人听见鸟叫后写下的声音，让没有声音的文字也仿佛会歌唱。",
          },
          {
            id: "dong2-1-6",
            text: "秦岭云横，迢递八千远路；巫山雨洗，嵯峨十二危峰。",
            pinyin: "qín lǐng yún héng，tiáo dì bā qiān yuǎn lù；wū shān yǔ xǐ，cuó é shí èr wēi fēng。",
            meaning: "云横在秦岭之间，远路漫长；雨洗过巫山，十二座高峰显得陡峭雄伟。",
            terms: [
              { word: "秦岭", pinyin: "qín lǐng", meaning: "横贯中国中部的一条巨大山脉。" },
              { word: "巫山", pinyin: "wū shān", meaning: "长江三峡一带的名山，以十二峰闻名。" },
              { word: "迢递", pinyin: "tiáo dì", meaning: "遥远、路途漫长。" },
              { word: "嵯峨", pinyin: "cuó é", meaning: "山势高大险峻。" },
            ],
            pairing: "秦岭对巫山，云横对雨洗，八千里远路对十二座高峰。两边都写云雨中的名山，却一个重在远，一个重在高。",
            storyTitle: "诗句里的秦岭与巫山",
            story: "“秦岭云横”让人想到韩愈被贬潮州、远行过秦岭的诗意；巫山自古以十二峰和云雨闻名。这里不是要孩子记数字，而是感受山路遥远、群峰高耸。",
          },
        ],
      },
      {
        title: "第二则 · 器物与名士",
        sentences: [
          {
            id: "dong2-2-1",
            text: "明对暗，淡对浓，上智对中庸。",
            pinyin: "míng duì àn，dàn duì nóng，shàng zhì duì zhōng yōng。",
            meaning: "明亮对昏暗，清淡对浓重；特别聪慧的人对做事恰到好处的人。",
            terms: [
              { word: "上智", pinyin: "shàng zhì", meaning: "才智非常突出的人。" },
              { word: "中庸", pinyin: "zhōng yōng", meaning: "不走极端，做事情合宜、恰到好处。" },
            ],
            pairing: "明暗、淡浓都能直接比较；上智重在聪明才智，中庸重在选择合宜的做法。",
            storyTitle: "合适并不是平平无奇",
            story: "“中庸”常被误解成什么都一般。它原本更接近不过头、也不缺少，能在不同情况中找到合适的办法。",
          },
          {
            id: "dong2-2-2",
            text: "镜奁对衣笥，野杵对村舂。",
            pinyin: "jìng lián duì yī sì，yě chǔ duì cūn chōng。",
            meaning: "装镜子和梳妆用品的盒子对盛衣服的竹箱，乡野的舂米棒对村中的舂米劳动。",
            terms: [
              { word: "镜奁", pinyin: "jìng lián", meaning: "古人收放镜子和梳妆用品的盒子。" },
              { word: "衣笥", pinyin: "yī sì", meaning: "古人用竹子编成、用来放衣服的箱子。" },
              { word: "杵", pinyin: "chǔ", meaning: "舂米时用来捣谷物的木棒。" },
              { word: "舂", pinyin: "chōng", meaning: "把谷物放进石臼中反复捣去外壳。" },
            ],
            pairing: "镜奁和衣笥都是收纳生活用品的器具；杵和舂都与古人加工粮食有关。",
            storyTitle: "古人的收纳盒和舂米工具",
            story: "这些物件今天已经不常见。读它们就像参观古人的家：房里有镜奁、衣笥，村中还能听见木杵舂米的声音。",
          },
          {
            id: "dong2-2-3",
            text: "花灼烁，草蒙茸，九夏对三冬。",
            pinyin: "huā zhuó shuò，cǎo méng róng，jiǔ xià duì sān dōng。",
            meaning: "花朵明艳闪亮，草木繁密柔软；长长的夏日对三个冬月。",
            terms: [
              { word: "灼烁", pinyin: "zhuó shuò", meaning: "明亮鲜艳、仿佛闪着光。" },
              { word: "蒙茸", pinyin: "méng róng", meaning: "草木繁密蓬松的样子。" },
              { word: "九夏", pinyin: "jiǔ xià", meaning: "古人对夏季或漫长夏日的一种说法。" },
              { word: "三冬", pinyin: "sān dōng", meaning: "冬季的三个月，也可以泛指冬天。" },
            ],
            pairing: "明艳花朵对繁密青草，夏天对冬天。先看近处的花草，再感受一年中的冷热季节。",
            storyTitle: NO_STORY_TITLE,
            story: "“灼烁”“蒙茸”都是把形状和感觉写得很生动的词，适合一边读一边想象。",
          },
          {
            id: "dong2-2-4",
            text: "台高名戏马，斋小号蟠龙。",
            pinyin: "tái gāo míng xì mǎ，zhāi xiǎo hào pán lóng。",
            meaning: "高台名叫戏马台，小书斋名叫蟠龙斋。",
            terms: [
              { word: "戏马台", pinyin: "xì mǎ tái", meaning: "古代徐州的一处高台，相传与项羽操练、观马有关。" },
              { word: "蟠龙斋", pinyin: "pán lóng zhāi", meaning: "古代故事中一间名为“蟠龙”的书斋。蟠龙是盘曲的龙。" },
            ],
            pairing: "高大的台对小巧的斋，戏马这个名字对蟠龙这个名字。建筑大小不同，却都有特别名称。",
            storyTitle: "建筑也有名字",
            story: "戏马台因历史故事得名；蟠龙斋则与东晋人物的小名和书斋传说相连。古人常给亭台书斋起有画面感的名字。",
          },
          {
            id: "dong2-2-5",
            text: "手擘蟹螯从毕卓，身披鹤氅自王恭。",
            pinyin: "shǒu bò xiè áo cóng bì zhuó，shēn pī hè chǎng zì wáng gōng。",
            meaning: "说到掰蟹螯、享受闲适生活，人们会想到毕卓；说到披着鹤羽般的外衣踏雪而行，人们会想到王恭。",
            terms: [
              { word: "毕卓", pinyin: "bì zhuó", meaning: "魏晋人物，故事中常以放达自在的形象出现。" },
              { word: "王恭", pinyin: "wáng gōng", meaning: "东晋人物，以披鹤氅踏雪的飘逸形象闻名。" },
              { word: "蟹螯", pinyin: "xiè áo", meaning: "螃蟹前面像钳子的大脚。" },
              { word: "鹤氅", pinyin: "hè chǎng", meaning: "古代一种宽大的外衣，常被想象得像鹤羽一样飘逸。" },
            ],
            pairing: "毕卓和王恭都是魏晋人物；一个故事写手中蟹螯，一个故事写身上鹤氅，都表现名士自在洒脱的形象。",
            storyTitle: "毕卓与王恭",
            story: "毕卓曾用蟹螯和酒形容自己的理想生活；王恭披鹤氅在雪中行走，被赞像神仙。给孩子讲时，重点是古人借衣食塑造人物，不把饮酒当作可以模仿的行为。",
          },
          {
            id: "dong2-2-6",
            text: "五老峰高，秀插云霄如玉笔；三姑石大，响传风雨若金镛。",
            pinyin: "wǔ lǎo fēng gāo，xiù chā yún xiāo rú yù bǐ；sān gū shí dà，xiǎng chuán fēng yǔ ruò jīn yōng。",
            meaning: "五老峰高高插入云端，像洁白的玉笔；三姑石巨大，风雨中的回响像敲响大钟。",
            terms: [
              { word: "五老峰", pinyin: "wǔ lǎo fēng", meaning: "庐山著名山峰，五座峰并列，好像五位老人。" },
              { word: "三姑石", pinyin: "sān gū shí", meaning: "古代地理记载中的三座巨石或石峰。" },
              { word: "玉笔", pinyin: "yù bǐ", meaning: "玉做的笔，这里比喻洁白挺拔的山峰。" },
              { word: "金镛", pinyin: "jīn yōng", meaning: "金属制成的大钟。镛，是古代大钟。" },
            ],
            pairing: "五对三，老人之名对女子之名，高峰对巨石，玉笔的形状对金钟的声音。既能看见，也仿佛能听见。",
            storyTitle: "山像笔，石头像钟",
            story: "古人看到高峰，会想象成直插天空的毛笔；听见风雨穿过巨石的回声，又会想到大钟。这是把自然景物写活的想象。",
          },
        ],
      },
      {
        title: "第三则 · 品德与志趣",
        sentences: [
          {
            id: "dong2-3-1",
            text: "仁对义，让对恭，禹舜对羲农。",
            pinyin: "rén duì yì，ràng duì gōng，yǔ shùn duì xī nóng。",
            meaning: "仁爱对正义，谦让对恭敬；大禹、舜对伏羲、神农。",
            terms: [
              { word: "仁", pinyin: "rén", meaning: "关心、爱护别人。" },
              { word: "义", pinyin: "yì", meaning: "做合宜、正直的事情。" },
              { word: "禹舜", pinyin: "yǔ shùn", meaning: "大禹和舜，传说中的两位上古贤明首领。" },
              { word: "羲农", pinyin: "xī nóng", meaning: "伏羲和神农，古代传说中的两位先民首领。" },
            ],
            pairing: "仁义和谦让恭敬都是古人重视的品德；禹、舜与伏羲、神农都是上古故事中的重要人物。",
            storyTitle: "传说中的上古人物",
            story: "大禹治水、舜以品德闻名；伏羲和神农则与渔猎、农耕、医药等文明传说相连。这些故事表达了古人对先民智慧的敬意。",
          },
          {
            id: "dong2-3-2",
            text: "雪花对云叶，芍药对芙蓉。",
            pinyin: "xuě huā duì yún yè，sháo yào duì fú róng。",
            meaning: "雪花对像叶片一样舒展的云朵，芍药花对芙蓉花。",
            terms: [
              { word: "雪花", pinyin: "xuě huā", meaning: "从天空飘落的雪片。" },
              { word: "云叶", pinyin: "yún yè", meaning: "像叶片一样铺展的云，也可以理解为一片片云。" },
              { word: "芍药", pinyin: "sháo yào", meaning: "春末夏初开放、花朵丰美的植物。" },
              { word: "芙蓉", pinyin: "fú róng", meaning: "这里多指荷花，也可指木芙蓉，要结合古文语境理解。" },
            ],
            pairing: "雪花和云叶都在天空，芍药和芙蓉都是花。白色轻盈的天空景物对色彩丰美的地上花朵。",
            storyTitle: NO_STORY_TITLE,
            story: "古人喜欢把云想象成叶、锦、衣裳等形状，这让看不见边界的云变得更容易想象。",
          },
          {
            id: "dong2-3-3",
            text: "陈后主，汉中宗，绣虎对雕龙。",
            pinyin: "chén hòu zhǔ，hàn zhōng zōng，xiù hǔ duì diāo lóng。",
            meaning: "陈后主对汉中宗；有“绣虎”称号的曹植，对写作《文心雕龙》的刘勰。",
            terms: [
              { word: "陈后主", pinyin: "chén hòu zhǔ", meaning: "南朝陈最后一位皇帝陈叔宝。" },
              { word: "汉中宗", pinyin: "hàn zhōng zōng", meaning: "汉宣帝刘询的庙号。" },
              { word: "绣虎", pinyin: "xiù hǔ", meaning: "古人赞美曹植文采出众的称号。" },
              { word: "雕龙", pinyin: "diāo lóng", meaning: "与刘勰的文学名著《文心雕龙》相连。" },
            ],
            pairing: "两位皇帝相对，两位以文章著名的人相对；绣虎和雕龙又都是华美有力量的动物形象。",
            storyTitle: "绣虎与雕龙",
            story: "曹植文章华美有气势，古人称他“绣虎”；刘勰写《文心雕龙》讲文章怎样写得有条理、有光彩。两个称呼都在赞美文学才华。",
          },
          {
            id: "dong2-3-4",
            text: "柳塘风淡淡，花圃月浓浓。",
            pinyin: "liǔ táng fēng dàn dàn，huā pǔ yuè nóng nóng。",
            meaning: "柳树围着池塘，微风轻轻吹过；花圃上月色浓浓，夜景安静明亮。",
            terms: [
              { word: "柳塘", pinyin: "liǔ táng", meaning: "种着柳树的池塘。" },
              { word: "花圃", pinyin: "huā pǔ", meaning: "种植花草的园地。" },
              { word: "淡淡", pinyin: "dàn dàn", meaning: "轻柔、不浓重。" },
              { word: "浓浓", pinyin: "nóng nóng", meaning: "色彩或感觉浓厚、鲜明。" },
            ],
            pairing: "柳塘对花圃，风对月，淡淡对浓浓。一个能感到轻风，一个能看见月色。",
            storyTitle: NO_STORY_TITLE,
            story: "这句不用很多动作，只用“淡淡”和“浓浓”，就让夜晚显得安静又有层次。",
          },
          {
            id: "dong2-3-5",
            text: "春日正宜朝看蝶，秋风那更夜闻蛩。",
            pinyin: "chūn rì zhèng yí zhāo kàn dié，qiū fēng nǎ gèng yè wén qióng。",
            meaning: "春日早晨正适合看蝴蝶飞舞；秋风吹起的夜晚，再听见蟋蟀声，更让人感到秋意。",
            terms: [
              { word: "朝", pinyin: "zhāo", meaning: "这里读“招”，表示早晨。" },
              { word: "夜", pinyin: "yè", meaning: "夜晚，与早晨相照应。" },
              { word: "看蝶", pinyin: "kàn dié", meaning: "观看蝴蝶飞舞。" },
              { word: "闻蛩", pinyin: "wén qióng", meaning: "听见蟋蟀鸣叫。闻，在这里是听见。" },
            ],
            pairing: "春日对秋风，早晨对夜晚，看蝴蝶对听蟋蟀。季节、时间、动作和小动物都互相照应。",
            storyTitle: NO_STORY_TITLE,
            story: "春天的蝴蝶让人感到明快，秋夜的虫声常让古人感到安静或思念。相同的小动物，也能带来不同季节的心情。",
          },
          {
            id: "dong2-3-6",
            text: "战士邀功，必借干戈成勇武；逸民适志，须凭诗酒养疏慵。",
            pinyin: "zhàn shì yāo gōng，bì jiè gān gē chéng yǒng wǔ；yì mín shì zhì，xū píng shī jiǔ yǎng shū yōng。",
            meaning: "古代战士想建立功劳，要凭武器和勇气；隐居的人想过合乎心意的生活，常借写诗赏景培养闲适心情。",
            terms: [
              { word: "战士", pinyin: "zhàn shì", meaning: "古代参加战斗的人。" },
              { word: "逸民", pinyin: "yì mín", meaning: "离开官场、选择隐居生活的人。" },
              { word: "干戈", pinyin: "gān gē", meaning: "古代两种兵器，后来也用来代指战争。" },
              { word: "诗酒", pinyin: "shī jiǔ", meaning: "古人写诗、宴饮的生活意象；儿童不能饮酒。" },
            ],
            pairing: "战士对隐者，勇武对闲适，武器对诗意生活。两边写的是古人选择的两种完全不同的人生道路。",
            storyTitle: "了解古人的生活，不照着模仿",
            story: "这句记录古人对从军和隐居的想象。“干戈”不是鼓励打仗，“诗酒”中的酒也不是儿童可以尝试的东西；我们重点理解两种不同志趣。",
          },
        ],
      },
    ],
  },
  RHYME_CHAPTER_THREE,
  RHYME_CHAPTER_FOUR,
  RHYME_CHAPTER_FIVE,
] as const;

export function annotatedChapterById(id: string) {
  return RHYME_ANNOTATED_CHAPTERS.find((chapter) => chapter.id === id);
}

export function allSentences(chapter: AnnotatedRhymeChapter) {
  return chapter.sections.flatMap((section) => section.sentences);
}

export function pairedTerms(sentence: RhymeSentence) {
  const pairs: Array<readonly [RhymeTerm, RhymeTerm]> = [];
  for (let index = 0; index < sentence.terms.length; index += 2) {
    const left = sentence.terms[index];
    const right = sentence.terms[index + 1];
    if (left && right) pairs.push([left, right]);
  }
  return pairs;
}

export function sentenceNarration(sentence: RhymeSentence) {
  const wordNarration = pairedTerms(sentence)
    .map(([left, right]) => `${left.word}，${left.meaning}；对面的${right.word}，${right.meaning}`)
    .join("；");
  return `${sentence.text}。先懂意思：${sentence.meaning}。词语小卡：${wordNarration}。为什么这样对：${sentence.pairing}。${sentence.storyTitle}：${sentence.story}`;
}
