import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  Image as ImageIcon,
  ImagePlus,
  LayoutTemplate,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import { CanvasSizeSelect } from "@/components/editor/CanvasSizeSelect";

type TopToolbarProps = {
  projectName: string;
  moduleCount: number;
  // 整体说明（写给 AI 看的额外描述），随导出写进 DESIGN BRIEF。
  brief: string;
  // 画布尺寸（从底部工具栏挪到导航栏，作为工程级设置常驻）。
  width: number;
  height: number;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  // 背景参考图（base64 data URL）。从属性栏挪到导航栏，可随时更换/删除。
  backgroundImage?: string;
  onBackgroundChange: (dataUrl: string | undefined) => void;
  onProjectNameChange: (value: string) => void;
  onBriefChange: (value: string) => void;
  onDownload: () => void;
  // 导出画布预览图（PNG）。区域 11 规划稿的「选择性导出其他内容」下拉项之一。
  onExportImage: () => void;
  // 复制导出的 HTML 到剪贴板（从预览栏挪到导航栏，预览栏只保留统计+预览）。
  onCopyCode: () => Promise<void> | void;
  // 导出配置 JSON（.json 工程快照，可复写）——收进导出下拉，不再单独占按钮。
  onSaveConfig: () => void;
  // 云端项目下拉 + 保存按钮（ProjectSwitcher）。由 Editor 注入，避免本组件依赖后端逻辑。
  projectSlot?: ReactNode;
};

export function TopToolbar({
  projectName,
  moduleCount,
  brief,
  width,
  height,
  onWidthChange,
  onHeightChange,
  backgroundImage,
  onBackgroundChange,
  onProjectNameChange,
  onBriefChange,
  onDownload,
  onCopyCode,
  onSaveConfig,
  onExportImage,
  projectSlot,
}: TopToolbarProps) {
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // 选取背景图：读成 base64 data URL 交给上层（随工程持久化）。
  // 清空 value 以便连续选同名文件仍触发 change。
  const handleBackgroundPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onBackgroundChange(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  // 导出下拉点击外部关闭（区域 11：选择性导出 HTML / 预览图 / 配置）。
  useEffect(() => {
    if (!exportOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setExportOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const handleCopy = async () => {
    await onCopyCode();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-aurora-green/15 bg-gradient-to-r from-night-900/55 via-night-850/45 to-night-900/55 px-6 py-3 shadow-[0_1px_0_rgba(52,240,168,0.12),0_12px_40px_rgba(5,6,15,0.45)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-4">
        {/* 左：logo / 本面板标识 + 画布尺寸（nav 规划区域 1-2）。
            画布尺寸是工程级设置，从画布底部工具栏挪来此处常驻；背景图挪到标题右侧。 */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex h-11 items-center gap-3 rounded-2xl border border-aurora-green/25 bg-gradient-to-r from-aurora-green/15 to-aurora-cyan/10 px-4 text-aurora-green">
            <LayoutTemplate className="h-4 w-4" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-aurora-green/70">
                UI Planner
              </div>
              <div className="text-sm font-medium">
                {moduleCount} 个模块已规划
              </div>
            </div>
          </div>

          <CanvasSizeSelect
            width={width}
            height={height}
            onWidthChange={onWidthChange}
            onHeightChange={onHeightChange}
          />
        </div>

        {/* 中：项目标题 + 说明下拉（nav 规划区域 3）。绝对定位对齐「屏幕中线」，
            脱离 flex——否则左右两块不等宽时，flex 的 mx-auto 会把标题挤歪。
            pointer-events-none 让空隙不挡点击，内部输入框再开启。 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="pointer-events-auto relative flex h-11 items-center rounded-2xl border border-white/10 bg-white/5 focus-within:border-aurora-green/60">
            <input
              value={projectName}
              onChange={(event) => onProjectNameChange(event.target.value)}
              className="h-full w-64 bg-transparent px-4 text-center text-sm text-white outline-none"
              placeholder="输入项目名称"
            />
            <button
              type="button"
              onClick={() => setBriefOpen((open) => !open)}
              aria-label="编辑整体说明"
              aria-expanded={briefOpen}
              className={`flex h-full items-center gap-1 rounded-r-2xl border-l border-white/10 px-3 text-xs transition hover:bg-aurora-green/10 ${
                brief.trim() ? "text-aurora-green" : "text-slate-400"
              }`}
            >
              说明
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${briefOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {briefOpen ? (
            <div className="pointer-events-auto absolute left-1/2 top-[calc(100%+8px)] z-30 w-80 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                整体说明（写给 AI）
              </div>
              <textarea
                value={brief}
                onChange={(event) => onBriefChange(event.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-aurora-green/55 focus:ring-2 focus:ring-aurora-green/20"
                placeholder="补充页面用途、风格、目标受众等，导出时写进 DESIGN BRIEF 顶部。"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                这段说明会出现在导出 HTML 的设计说明里，帮助 AI 先建立整体认知。
              </p>
            </div>
          ) : null}
        </div>

        {/* 右：背景图 / 复制代码 / 项目下拉+保存（projectSlot） / 导出（nav 规划区域 4-8）。
            背景参考图放右簇开头，与左簇的画布尺寸一左一右分列标题两侧。 */}
        <div className="flex shrink-0 items-center gap-3">
          {/* 背景参考图：未设置时显示「背景图」上传入口；已设置时分成
              「更换」（点整块重新选图）+「删除」（清空）两段。 */}
          {backgroundImage ? (
            <div className="flex h-11 items-stretch overflow-hidden rounded-2xl border border-aurora-green/30 bg-aurora-green/10 text-xs text-aurora-green">
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 transition hover:bg-aurora-green/15"
                title="更换背景参考图"
              >
                <ImageIcon className="h-4 w-4" />
                背景图
              </button>
              <button
                type="button"
                onClick={() => onBackgroundChange(undefined)}
                aria-label="删除背景参考图"
                title="删除背景参考图"
                className="flex items-center border-l border-aurora-green/25 px-2.5 text-aurora-green/80 transition hover:bg-rose-500/15 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs text-slate-300 transition hover:border-aurora-green/40 hover:bg-aurora-green/10 hover:text-aurora-green"
              title="上传背景参考图"
            >
              <ImagePlus className="h-4 w-4" />
              背景图
            </button>
          )}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackgroundPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 transition hover:border-aurora-green/40 hover:bg-aurora-green/10"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-300" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "已复制" : "复制代码"}
          </button>
          {projectSlot}
          <div ref={exportMenuRef} className="relative">
            <div className="flex h-11 items-stretch overflow-hidden rounded-2xl bg-gradient-to-r from-aurora-green via-aurora-teal to-aurora-blue shadow-[0_12px_35px_rgba(52,240,168,0.35)]">
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-2 px-4 text-sm font-medium text-slate-950 transition hover:brightness-105"
              >
                <Download className="h-4 w-4" />
                导出 HTML
              </button>
              <button
                type="button"
                onClick={() => setExportOpen((open) => !open)}
                aria-label="更多导出选项"
                aria-expanded={exportOpen}
                className="flex items-center border-l border-slate-950/20 px-2 text-slate-950 transition hover:brightness-105"
              >
                <ChevronDown
                  className={`h-4 w-4 transition ${exportOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            {exportOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-52 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <ExportItem
                  icon={<Download className="h-4 w-4" />}
                  label="导出 HTML 成品"
                  hint="纯净结构，给 AI 读"
                  onClick={() => {
                    setExportOpen(false);
                    onDownload();
                  }}
                />
                <ExportItem
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="导出预览图 PNG"
                  hint="当前画布快照"
                  onClick={() => {
                    setExportOpen(false);
                    onExportImage();
                  }}
                />
                <ExportItem
                  icon={<FileJson className="h-4 w-4" />}
                  label="导出配置 JSON"
                  hint="可重新导入复写"
                  onClick={() => {
                    setExportOpen(false);
                    onSaveConfig();
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

type ExportItemProps = {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
};

function ExportItem({ icon, label, hint, onClick }: ExportItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/8"
    >
      <span className="text-aurora-green">{icon}</span>
      <div className="min-w-0">
        <div className="truncate">{label}</div>
        <div className="truncate text-xs text-slate-500">{hint}</div>
      </div>
    </button>
  );
}
