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
  { id: 'Noto Sans SC', label: '思源黑体', category: 'sans', sample: '清晰现代' },
  { id: 'Noto Serif SC', label: '思源宋体', category: 'serif', sample: '典雅正文' },
  { id: 'LXGW WenKai', label: '霞鹜文楷', category: 'handwriting', sample: '温柔手写' },
  { id: 'ZCOOL KuaiLe', label: '站酷快乐体', category: 'cartoon', sample: '快乐卡通' },
  { id: 'ZCOOL QingKe HuangYou', label: '站酷黄油体', category: 'poster', sample: '醒目海报' },
  { id: 'Ma Shan Zheng', label: '毛笔题字', category: 'guofeng', sample: '国风题字' },

  // Native artistic Chinese fonts are intentionally included as a second line of defence.
  // On Windows/macOS these can work even if every external font CDN is unavailable.
  { id: 'Studio XingKai', label: '行楷艺术字', category: 'art', sample: '潇洒行楷' },
  { id: 'Studio Hupo', label: '琥珀卡通字', category: 'cartoon', sample: '可爱琥珀' },
  { id: 'Studio Caiyun', label: '彩云艺术字', category: 'art', sample: '缤纷彩云' },
  { id: 'Studio LiSu', label: '隶书标题字', category: 'guofeng', sample: '古朴隶书' },
  { id: 'Studio YouYuan', label: '幼圆卡通字', category: 'cartoon', sample: '圆润可爱' },
  { id: 'Studio FangSong', label: '仿宋文艺字', category: 'serif', sample: '古典文艺' },

  { id: 'Press Start 2P', label: 'Press Start 2P', category: 'pixel', sample: 'PIXEL GAME' },
  { id: 'system-ui', label: '系统默认', category: 'sans', sample: 'System UI' },
  { id: 'serif', label: '系统衬线', category: 'serif', sample: 'Classic Serif' },
  { id: 'cursive', label: '系统手写', category: 'handwriting', sample: 'Cursive' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureFontLoaded(family, weight = 400, size = 32, timeoutMs = 1100) {
  if (!family || !document.fonts?.load) return false;
  const spec = `${weight} ${size}px "${family}"`;
  try {
    await Promise.race([
      document.fonts.load(spec),
      sleep(timeoutMs),
    ]);
    return document.fonts.check(spec);
  } catch {
    return false;
  }
}

export function fontById(id) {
  return FONT_OPTIONS.find((font) => font.id === id) || FONT_OPTIONS[0];
}
