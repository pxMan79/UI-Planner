// 编辑器内「模块描边强调色」的工具。accent 只影响画布上的预览描边——导出的
// HTML 是统一线框灰，不受它影响——所以这里只关心「编辑时好看、好区分」。

// 一组经典、彼此协调的强调色。无选中模块时新增模块从中随机取一个，
// 连续新增的顶层模块颜色各异，比清一色绿色更易区分。首项是品牌默认绿。
export const ACCENT_PALETTE = [
  "#34f0a8", // 极光绿（品牌默认）
  "#4cc9f0", // 青蓝
  "#6366f1", // 靛蓝
  "#8b5cf6", // 紫
  "#f59e0b", // 琥珀
  "#f472b6", // 粉
  "#22d3ee", // 青
  "#fb7185", // 珊瑚红
];

const DEFAULT_ACCENT = ACCENT_PALETTE[0];

// 解析 #rgb / #rrggbb 为 {r,g,b}。非法输入返回 null，交由调用方兜底。
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

const toHex = (value: number) =>
  Math.round(value).toString(16).padStart(2, "0");

// 把颜色往白色方向混合 ratio（0..1），让它「变淡一些」。
// 用于新增模块时以所选模块颜色为基底、降一档明度，形成同色系的层次区分。
// 非法输入兜底回默认绿，绝不抛错（会在 store 的 set 里被调用）。
export const lightenHex = (hex: string, ratio: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return DEFAULT_ACCENT;
  }
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const mix = (channel: number) => channel + (255 - channel) * clamped;
  return `#${toHex(mix(rgb.r))}${toHex(mix(rgb.g))}${toHex(mix(rgb.b))}`;
};

// 从预设调色板里随机取一个强调色。
export const randomAccent = (): string =>
  ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];
