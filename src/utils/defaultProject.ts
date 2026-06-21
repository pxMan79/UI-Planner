import { CanvasProject } from "@/types/planner";

// 工厂函数而非常量：每次重置都生成新的时间戳。
// 如果导出为模块级常量，createdAt/updatedAt 会被钉死在「首次 import 的那一刻」，
// 调用 resetProject() 时恢复的是过期时间，而不是当前时间。
//
// 默认示例不画某个具体页面，而是把画布本身当成「本工具的说明书」：用一张
// 排布好的卡片墙介绍 UI Planner 是什么、怎么用、为什么这么设计。新用户打开
// 即可边读边拖、删掉就能开干——比一张空白画布或一份正式落地页更友好。
// brief 故意留空：标题旁的下拉说明一旦预填，用户清空反而麻烦（用户要求）。
export const createDefaultProject = (): CanvasProject => {
  const now = new Date().toISOString();

  return {
    id: "project-ui-planner",
    name: "👋 从这里开始",
    width: 1440,
    height: 960,
    createdAt: now,
    updatedAt: now,
    brief: "",
    modules: [
      {
        id: "intro-banner",
        name: "UI Planner · 把脑中的界面画给 AI 看",
        description:
          "在画布上拖框规划界面区域，一键导出「对 AI 友好」的纯净 HTML，让 AI 照着复现你想要的布局。这张示例就是用本工具拼出来的——读完随手删掉，即可开始你自己的规划。",
        semanticTag: "header",
        x: 80,
        y: 64,
        width: 1280,
        height: 150,
        zIndex: 1,
        locked: false,
        visible: true,
        accent: "#34f0a8",
        parentId: null,
        collapsed: false,
      },
      {
        id: "how-to",
        name: "三步上手",
        description:
          "① 拖框 → ② 选中后在右侧改名/写用途 → ③ 导出 HTML 丢给 AI。下面两张卡片是它的子模块，可拖动体验。",
        semanticTag: "section",
        x: 80,
        y: 248,
        width: 600,
        height: 300,
        zIndex: 2,
        locked: false,
        visible: true,
        accent: "#4cc9f0",
        parentId: null,
        collapsed: false,
      },
      {
        id: "how-to-tip-drag",
        name: "试试：拖拽合并成分组",
        description:
          "把一个模块拖到另一个模块上，它们会自动合并成父子分组（像浏览器标签分组）；拖出来又拆开。分组会体现为导出 HTML 里的嵌套结构。",
        semanticTag: "div",
        x: 112,
        y: 356,
        width: 536,
        height: 84,
        zIndex: 3,
        locked: false,
        visible: true,
        accent: "#7ad9f5",
        parentId: "how-to",
        collapsed: false,
      },
      {
        id: "how-to-tip-snap",
        name: "试试：边缘吸附对齐",
        description:
          "拖动或缩放时，模块边缘会贴合彼此与画布边界，并显示极光绿参考线。底部工具栏的磁铁按钮（快捷键 S）可随时开关。",
        semanticTag: "div",
        x: 112,
        y: 452,
        width: 536,
        height: 84,
        zIndex: 4,
        locked: false,
        visible: true,
        accent: "#7ad9f5",
        parentId: "how-to",
        collapsed: false,
      },
      {
        id: "philosophy",
        name: "设计理念：配置与成品分离",
        description:
          "导出的 .html 是给 AI 读的纯净结构，顶部带自然语言的 DESIGN BRIEF，不掺任何工程元数据；想分享给别人二次编辑，则用 .json 配置——一份完整工程快照。两者各司其职，互不污染。",
        semanticTag: "aside",
        x: 712,
        y: 248,
        width: 648,
        height: 300,
        zIndex: 5,
        locked: false,
        visible: true,
        accent: "#6366f1",
        parentId: null,
        collapsed: false,
      },
      {
        id: "why-percent",
        name: "为什么 AI 更易读",
        description:
          "位置和尺寸都换算成「相对父容器的百分比」，而非死钉的像素。AI 拿到的是与屏幕尺寸无关的比例关系，能在任意尺寸下还原同一版面，不会被某个固定画布尺寸带偏。",
        semanticTag: "section",
        x: 80,
        y: 580,
        width: 600,
        height: 300,
        zIndex: 6,
        locked: false,
        visible: true,
        accent: "#8b5cf6",
        parentId: null,
        collapsed: false,
      },
      {
        id: "features",
        name: "顺手的小功能",
        description:
          "实时预览导出效果 · 图层栏缩进树（可折叠/锁定/隐藏）· 撤销重做 · 复制/旋转模块 · 画布尺寸预设 · 背景参考图 · 云端多项目切换与保存。方向键还能 1px 微调选中模块。",
        semanticTag: "section",
        x: 712,
        y: 580,
        width: 648,
        height: 300,
        zIndex: 7,
        locked: false,
        visible: true,
        accent: "#f472b6",
        parentId: null,
        collapsed: false,
      },
    ],
  };
};
