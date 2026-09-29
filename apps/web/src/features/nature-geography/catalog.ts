export const GEOGRAPHY_PAGES = [
  { id: "world", title: "世界", description: "看看陆地、海洋和世界各地的自然模样。", topics: ["海拔图", "国家图", "大洲图", "海洋图", "气候图", "语种分布", "山脉图", "矿藏图"], note: "切换八种图层，放大探索世界。" },
  { id: "china", title: "中国", description: "从中国全貌，一步步认识省、市和区县。", topics: ["省", "市", "区县", "点亮地图"], note: "逐级查看省、市、区县，勾选点亮认识的地方。" },
  { id: "footprints", title: "足迹", description: "把走过的地方，变成自己的旅行相册。", topics: ["选择地点", "写下记录", "添加照片", "放大看照片"], note: "在地图上选点、写下记录、添加照片，放大查看旅行回忆。" },
] as const;

export type GeographyId = typeof GEOGRAPHY_PAGES[number]["id"];
