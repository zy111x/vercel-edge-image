export const FONT_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'sans', label: '现代' },
  { id: 'serif', label: '衬线' },
  { id: 'handwriting', label: '手写' },
  { id: 'cartoon', label: '卡通' },
  { id: 'poster', label: '海报' },
  { id: 'guofeng', label: '国风' },
  { id: 'pixel', label: '像素' },
];

export const FONT_OPTIONS = [
  { id: 'Noto Sans SC', label: '思源黑体', category: 'sans', sample: '清晰现代' },
  { id: 'Noto Serif SC', label: '思源宋体', category: 'serif', sample: '典雅正文' },
  { id: 'LXGW WenKai', label: '霞鹜文楷', category: 'handwriting', sample: '温柔手写' },
  { id: 'ZCOOL KuaiLe', label: '站酷快乐体', category: 'cartoon', sample: '快乐卡通' },
  { id: 'ZCOOL QingKe HuangYou', label: '站酷黄油体', category: 'poster', sample: '醒目海报' },
  { id: 'Ma Shan Zheng', label: '马善政毛笔体', category: 'guofeng', sample: '国风题字' },
  { id: 'Press Start 2P', label: 'Press Start 2P', category: 'pixel', sample: 'PIXEL GAME' },
  { id: 'system-ui', label: '系统默认', category: 'sans', sample: 'System UI' },
  { id: 'serif', label: '系统衬线', category: 'serif', sample: 'Classic Serif' },
  { id: 'cursive', label: '系统手写', category: 'handwriting', sample: 'Cursive' },
];

export async function ensureFontLoaded(family, weight = 400, size = 32) {
  if (!family || !document.fonts?.load) return;
  try {
    await document.fonts.load(`${weight} ${size}px "${family}"`);
  } catch {
    // Generic system fonts and blocked remote fonts can safely fall back.
  }
}

export function fontById(id) {
  return FONT_OPTIONS.find((font) => font.id === id) || FONT_OPTIONS[0];
}
