export const FONT_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'sans', label: '现代' },
  { id: 'serif', label: '衬线' },
  { id: 'handwriting', label: '手写' },
  { id: 'cartoon', label: '卡通' },
  { id: 'poster', label: '海报' },
  { id: 'guofeng', label: '国风' },
  { id: 'art', label: '艺术字' },
  { id: 'pixel', label: '像素' },
];

export const FONT_OPTIONS = [
  { id: 'Studio Modern', label: '现代黑体', category: 'sans', sample: '清晰现代' },
  { id: 'Studio Serif', label: '典雅宋体', category: 'serif', sample: '典雅正文' },
  { id: 'Studio WenKai', label: '文楷手写', category: 'handwriting', sample: '温柔手写' },
  { id: 'Studio Cartoon', label: '圆润卡通', category: 'cartoon', sample: '快乐卡通' },
  { id: 'Studio Poster', label: '粗黑海报', category: 'poster', sample: '醒目海报' },
  { id: 'Studio Brush', label: '毛笔题字', category: 'guofeng', sample: '国风题字' },
  { id: 'Studio XingKai', label: '行楷艺术字', category: 'art', sample: '潇洒行楷' },
  { id: 'Studio Hupo', label: '琥珀卡通字', category: 'cartoon', sample: '可爱琥珀' },
  { id: 'Studio Caiyun', label: '彩云艺术字', category: 'art', sample: '缤纷彩云' },
  { id: 'Studio LiSu', label: '隶书标题字', category: 'guofeng', sample: '古朴隶书' },
  { id: 'Studio YouYuan', label: '幼圆卡通字', category: 'cartoon', sample: '圆润可爱' },
  { id: 'Studio FangSong', label: '仿宋文艺字', category: 'serif', sample: '古典文艺' },
  { id: 'Studio Hand', label: '手写涂鸦', category: 'handwriting', sample: 'Hand Writing' },
  { id: 'Studio Pixel', label: '像素游戏字', category: 'pixel', sample: 'PIXEL GAME' },
];

const FONT_STACKS = {
  'Studio Modern': '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Helvetica Neue",Arial,sans-serif',
  'Studio Serif': 'SimSun,"Songti SC","Noto Serif CJK SC",Georgia,serif',
  'Studio WenKai': 'KaiTi,"Kaiti SC",STKaiti,FangSong,"FangSong SC",serif',
  'Studio Cartoon': 'YouYuan,"Microsoft YaHei","PingFang SC","Arial Rounded MT Bold",sans-serif',
  'Studio Poster': 'SimHei,"Microsoft YaHei UI","Arial Black","PingFang SC",sans-serif',
  'Studio Brush': 'STXingkai,"华文行楷",KaiTi,"Kaiti SC",cursive',
  'Studio XingKai': 'STXingkai,"华文行楷",KaiTi,"Kaiti SC",cursive',
  'Studio Hupo': 'STHupo,"华文琥珀",YouYuan,"Microsoft YaHei",sans-serif',
  'Studio Caiyun': 'STCaiyun,"华文彩云",STHupo,"华文琥珀",YouYuan,sans-serif',
  'Studio LiSu': 'LiSu,"隶书",KaiTi,"Kaiti SC",serif',
  'Studio YouYuan': 'YouYuan,"幼圆","Microsoft YaHei","PingFang SC",sans-serif',
  'Studio FangSong': 'FangSong,"仿宋",STFangsong,"华文仿宋",serif',
  'Studio Hand': '"Segoe Print","Comic Sans MS",KaiTi,cursive',
  'Studio Pixel': 'Consolas,"Courier New",monospace',
};

const LEGACY_FONT_IDS = {
  'Noto Sans SC': 'Studio Modern',
  'Noto Serif SC': 'Studio Serif',
  'LXGW WenKai': 'Studio WenKai',
  'ZCOOL KuaiLe': 'Studio Cartoon',
  'ZCOOL QingKe HuangYou': 'Studio Poster',
  'Ma Shan Zheng': 'Studio Brush',
  'Press Start 2P': 'Studio Pixel',
  'system-ui': 'Studio Modern',
  'serif': 'Studio Serif',
  'cursive': 'Studio Hand',
};

export function canonicalFontId(id) {
  return LEGACY_FONT_IDS[id] || id || 'Studio Modern';
}

export function fontCssFamily(id) {
  return FONT_STACKS[canonicalFontId(id)] || FONT_STACKS['Studio Modern'];
}

export async function ensureFontLoaded(family, weight = 400, size = 32) {
  if (!document.fonts?.load) return true;
  const spec = `${weight} ${size}px ${fontCssFamily(family)}`;
  try {
    await document.fonts.load(spec);
    return true;
  } catch {
    return true;
  }
}

export function fontById(id) {
  const canonical = canonicalFontId(id);
  return FONT_OPTIONS.find((font) => font.id === canonical) || FONT_OPTIONS[0];
}
