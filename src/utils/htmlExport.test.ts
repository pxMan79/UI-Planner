import { describe, expect, it } from "vitest";

import { createDefaultProject } from "@/utils/defaultProject";
import { buildExportPayload } from "@/utils/htmlExport";
import { CanvasProject, UIModule } from "@/types/planner";

const makeModule = (over: Partial<UIModule>): UIModule => ({
  id: "m",
  name: "区域",
  description: "",
  semanticTag: "div",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  zIndex: 1,
  locked: false,
  visible: true,
  accent: "#22c55e",
  parentId: null,
  collapsed: false,
  ...over,
});

const makeProject = (modules: UIModule[]): CanvasProject => ({
  id: "p",
  name: "测试项目",
  width: 1000,
  height: 1000,
  modules,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("htmlExport", () => {
  it("生成包含画布尺寸的完整 HTML 文档", () => {
    const project = createDefaultProject();
    const payload = buildExportPayload(project);

    expect(payload.document).toContain("<!doctype html>");
    // 画布尺寸作为「参考」写进 max-width / aspect-ratio，而非死钉的固定宽高。
    expect(payload.css).toContain("max-width: 1440px;");
    expect(payload.css).toContain("aspect-ratio: 1440 / 960;");
    // 标题用示例的实际项目名，避免改示例文案就得改测试。
    expect(payload.document).toContain(`${project.name} - UI 布局规格稿`);
  });

  it("文档顶部输出 DESIGN BRIEF，便于 AI 先建立整体布局认知", () => {
    const payload = buildExportPayload(createDefaultProject());

    expect(payload.html).toContain("DESIGN BRIEF");
    // 画布尺寸明确标注「仅参考」，强调布局靠百分比而非像素等比复刻。
    expect(payload.html).toContain("参考画布尺寸：1440 × 960 px");
    expect(payload.html).toContain("区域地图：");
  });

  it("位置/尺寸用相对父容器的百分比，而非绝对像素", () => {
    const payload = buildExportPayload(
      makeProject([makeModule({ id: "a", name: "区域", x: 250, y: 500, width: 500, height: 250 })]),
    );

    // 1000×1000 画布里，x250/y500/w500/h250 → 左25% 上50% 宽50% 高25%。
    expect(payload.html).toContain("left:25%;top:50%;width:50%;height:25%;");
    // 不再出现 px 形式的绝对定位。
    expect(payload.html).not.toMatch(/left:\d+px/);
  });

  it("class 名用稳定的 block-N，中文名进 data-name", () => {
    const payload = buildExportPayload(
      makeProject([makeModule({ id: "a", name: "首屏区域" })]),
    );

    expect(payload.html).toContain('class="ui-block block-1"');
    expect(payload.html).toContain('data-name="首屏区域"');
    // 中文不应出现在 class 里
    expect(payload.html).not.toContain('class="ui-block 首屏区域"');
  });

  it("把绝对坐标翻译成自然语言方位描述", () => {
    const payload = buildExportPayload(createDefaultProject());

    expect(payload.html).toMatch(/顶部|通栏|右侧|左侧/);
    expect(payload.html).toContain("data-region=");
  });

  it("父子嵌套：子模块作为 DOM 写在父模块标签内部", () => {
    const payload = buildExportPayload(
      makeProject([
        makeModule({ id: "parent", name: "左侧栏", zIndex: 1 }),
        makeModule({
          id: "child",
          name: "子模块",
          parentId: "parent",
          zIndex: 2,
        }),
      ]),
    );

    // 父区域注释应标注「含 1 个子区域」
    expect(payload.html).toContain("含 1 个子区域");
    // 子模块的 data-name 应出现在父模块闭合标签之前——即真正嵌套
    const parentOpen = payload.html.indexOf('data-name="左侧栏"');
    const childOpen = payload.html.indexOf('data-name="子模块"');
    expect(parentOpen).toBeGreaterThanOrEqual(0);
    expect(childOpen).toBeGreaterThan(parentOpen);
  });

  it("brief 整体说明会输出到 DESIGN BRIEF 中", () => {
    const project = {
      ...makeProject([makeModule({ id: "a", name: "区域A" })]),
      brief: "这是写给 AI 的整体说明",
    };
    const payload = buildExportPayload(project);

    expect(payload.html).toContain("整体说明（作者写给 AI）");
    expect(payload.html).toContain("这是写给 AI 的整体说明");
  });

  it("转义用户输入中会破坏 HTML 结构的字符", () => {
    const payload = buildExportPayload({
      ...makeProject([
        makeModule({
          id: "a",
          name: "<script>alert(1)</script>",
          description: "a \" b ' c",
        }),
      ]),
      name: '危险"项目',
    });

    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).toContain("&quot;");
    expect(payload.html).toContain("&#39;");
    expect(payload.document).toContain("危险&quot;项目");
  });

  it("空名不让导出抛错，而是兜底占位（回归：防黑屏）", () => {
    const project = makeProject([makeModule({ id: "a", name: "" })]);

    expect(() => buildExportPayload(project)).not.toThrow();
    expect(buildExportPayload(project).html).toContain("未命名区域");
  });

  it("描述为空时不渲染用途文案块", () => {
    const payload = buildExportPayload(
      makeProject([makeModule({ id: "a", name: "空描述", description: "" })]),
    );

    expect(payload.html).toContain("空描述");
    // 说明文字块只在有描述时渲染（且全文只出现一处，不再与注释重复）。
    expect(payload.html).not.toContain("ui-block__note");
  });
});
