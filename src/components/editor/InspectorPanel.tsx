import { Keyboard } from "lucide-react";
import type { ReactNode } from "react";

import { CanvasProject, SemanticTag, UIModule } from "@/types/planner";

const semanticOptions: SemanticTag[] = [
  "header",
  "section",
  "main",
  "aside",
  "nav",
  "footer",
  "div",
];

type InspectorPanelProps = {
  project: CanvasProject;
  selectedModule: UIModule | null;
  onProjectMetaChange: (
    payload: Partial<Pick<CanvasProject, "name" | "backgroundImage">>,
  ) => void;
  onModuleChange: (moduleId: string, patch: Partial<UIModule>) => void;
};

export function InspectorPanel({
  project,
  selectedModule,
  onProjectMetaChange,
  onModuleChange,
}: InspectorPanelProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          {selectedModule ? "模块属性" : "项目属性"}
        </h2>
        {selectedModule ? (
          <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
            {selectedModule.semanticTag}
          </div>
        ) : null}
      </div>

      {selectedModule ? (
        <div className="mt-4 space-y-3">
          <Field label="模块名称">
            <input
              value={selectedModule.name}
              onChange={(event) =>
                onModuleChange(selectedModule.id, { name: event.target.value })
              }
              className="panel-input"
              placeholder="例如：Hero 首屏"
            />
          </Field>

          <Field label="文本描述">
            <textarea
              value={selectedModule.description}
              onChange={(event) =>
                onModuleChange(selectedModule.id, {
                  description: event.target.value,
                })
              }
              className="panel-textarea thin-scrollbar !min-h-[84px] !leading-6"
              placeholder="描述这个区域的功能与布局建议"
            />
          </Field>

          {/* X/Y/宽/高 压成一行四列，省高度让右下预览露出 */}
          <div className="grid grid-cols-4 gap-2">
            <Field label="X">
              <input
                type="number"
                value={Math.round(selectedModule.x)}
                onChange={(event) =>
                  onModuleChange(selectedModule.id, {
                    x: Number(event.target.value),
                  })
                }
                className="panel-input !px-2 !text-center"
              />
            </Field>
            <Field label="Y">
              <input
                type="number"
                value={Math.round(selectedModule.y)}
                onChange={(event) =>
                  onModuleChange(selectedModule.id, {
                    y: Number(event.target.value),
                  })
                }
                className="panel-input !px-2 !text-center"
              />
            </Field>
            <Field label="宽">
              <input
                type="number"
                min={12}
                value={Math.round(selectedModule.width)}
                onChange={(event) =>
                  onModuleChange(selectedModule.id, {
                    width: Math.max(12, Number(event.target.value)),
                  })
                }
                className="panel-input !px-2 !text-center"
              />
            </Field>
            <Field label="高">
              <input
                type="number"
                min={12}
                value={Math.round(selectedModule.height)}
                onChange={(event) =>
                  onModuleChange(selectedModule.id, {
                    height: Math.max(12, Number(event.target.value)),
                  })
                }
                className="panel-input !px-2 !text-center"
              />
            </Field>
          </div>

          {/* 语义标签 + 强调色 合一行，进一步压缩高度 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="语义标签">
              <select
                value={selectedModule.semanticTag}
                onChange={(event) =>
                  onModuleChange(selectedModule.id, {
                    semanticTag: event.target.value as SemanticTag,
                  })
                }
                className="panel-input !px-3"
              >
                {semanticOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="强调色">
              <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/55 px-2">
                <input
                  type="color"
                  value={selectedModule.accent}
                  onChange={(event) =>
                    onModuleChange(selectedModule.id, {
                      accent: event.target.value,
                    })
                  }
                  className="h-7 w-9 shrink-0 bg-transparent"
                />
                <span className="truncate text-xs text-slate-300">
                  {selectedModule.accent}
                </span>
              </div>
            </Field>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <Field label="项目名称">
            <input
              value={project.name}
              onChange={(event) =>
                onProjectMetaChange({ name: event.target.value })
              }
              className="panel-input"
            />
          </Field>

          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
              <Keyboard className="h-4 w-4 text-aurora-green" />
              快捷键
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
              <Shortcut keys={["N"]} desc="新增模块" />
              <Shortcut keys={["S"]} desc="切换吸附 / 自由" />
              <Shortcut keys={["↑", "↓", "←", "→"]} desc="微调位置 1px" />
              <Shortcut keys={["Shift", "方向键"]} desc="微调位置 10px" />
              <Shortcut keys={["Ctrl", "D"]} desc="复制选中模块" />
              <Shortcut keys={["Del"]} desc="删除选中模块" />
              <Shortcut keys={["Esc"]} desc="取消选择" />
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

type ShortcutProps = {
  keys: string[];
  desc: string;
};

// 一行快捷键：左侧若干键帽（多键以 + 连接），右侧功能说明。
function Shortcut({ keys, desc }: ShortcutProps) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1">
        {keys.map((key, index) => (
          <span key={key} className="inline-flex items-center gap-1">
            {index > 0 ? (
              <span className="text-[10px] text-slate-600">+</span>
            ) : null}
            <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-slate-200">
              {key}
            </kbd>
          </span>
        ))}
      </span>
      <span className="text-slate-400">{desc}</span>
    </li>
  );
}
