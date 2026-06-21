import type Konva from "konva";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CanvasBoard } from "@/components/editor/CanvasBoard";
import { CanvasFloatingActions } from "@/components/editor/CanvasFloatingActions";
import { InspectorPanel } from "@/components/editor/InspectorPanel";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { PreviewPanel } from "@/components/editor/PreviewPanel";
import { ProjectSwitcher } from "@/components/editor/ProjectSwitcher";
import { TopToolbar } from "@/components/editor/TopToolbar";
import { safeFileName } from "@/lib/utils";
import { usePlannerStore } from "@/store/usePlannerStore";
import { ModuleDraft } from "@/types/planner";
import { buildExportPayload } from "@/utils/htmlExport";
import { flattenForLayers } from "@/utils/moduleTree";
import {
  parseProjectConfig,
  serializeProjectConfig,
} from "@/utils/projectConfig";

const clampCanvasValue = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.min(Math.max(value, 640), 2400);
};

const DEFAULT_LEFT_WIDTH = 300;
const DEFAULT_RIGHT_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 520;
const COMPACT_LAYOUT_BREAKPOINT = 1280;

const clampSidebarWidth = (value: number) =>
  Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);

// 云端操作统一的错误兜底：失败弹一句友好提示（带后端文案或网络兜底语），
// 而不是每个 handler 各写一遍同样的 try/catch。
const runCloudAction = async (action: () => Promise<void>, label: string) => {
  try {
    await action();
  } catch (error) {
    window.alert(
      `${label}：${error instanceof Error ? error.message : "无法连接到存储服务"}`,
    );
  }
};

export function Editor() {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1600 : window.innerWidth,
  );
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  // 当前挂载的 Konva 画布（compact/desktop 同时只渲染一个），用于导出 PNG 预览图。
  const stageRef = useRef<Konva.Stage | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // 吸附定位开关：拖动/缩放时模块边缘贴合彼此与画布边界。偏好持久化到 localStorage，
  // 由画布工具栏的磁铁按钮和快捷键 S 共享同一状态。默认开启（更省心的对齐辅助）。
  const [snapEnabled, setSnapEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("ui-planner-snap") !== "off";
  });
  const toggleSnap = () =>
    setSnapEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("ui-planner-snap", next ? "on" : "off");
      return next;
    });
  const {
    project,
    selectedModuleId,
    selectModule,
    setProjectMeta,
    resetProject,
    importProject,
    addModule,
    updateModule,
    deleteModule,
    duplicateModule,
    dropModule,
    reorderModule,
    toggleCollapsed,
    undo,
    redo,
    rotateModule,
    past,
    future,
    remoteProjectId,
    loadRemoteProject,
    setRemoteProjectId,
  } = usePlannerStore();

  // 项目下拉的刷新信号：每次保存/新建/删除后自增，触发 ProjectSwitcher 重拉列表。
  const [projectListVersion, setProjectListVersion] = useState(0);
  const [saving, setSaving] = useState(false);

  const selectedModule =
    project.modules.find((module) => module.id === selectedModuleId) ?? null;
  const exportPayload = useMemo(() => buildExportPayload(project), [project]);
  const isCompactLayout = viewportWidth < COMPACT_LAYOUT_BREAKPOINT;

  // 图层栏按嵌套树展示：父在前、子缩进紧随，collapsed 的父模块整棵子树跳过。
  // 同层按 zIndex 升序——与画布层级一致。flattenForLayers 内部已建树并排序。
  const layeredNodes = useMemo(
    () => flattenForLayers(project.modules),
    [project.modules],
  );

  // 重置示例会清空 LocalStorage 里的全部规划，且不可撤销——先确认。
  const handleResetProject = () => {
    if (
      window.confirm("重置示例会清空当前所有模块和项目设置，且无法撤销。确定继续？")
    ) {
      resetProject();
    }
  };

  const createDefaultDraft = (
    overrides: Partial<ModuleDraft> = {},
  ): ModuleDraft => ({
    name: `模块 ${project.modules.length + 1}`,
    description: "",
    semanticTag: "div",
    x: Math.max(32, project.width / 2 - 180),
    y: Math.max(32, project.height / 2 - 120),
    width: 360,
    height: 240,
    ...overrides,
  });

  const handleDownload = () => {
    const blob = new Blob([exportPayload.document], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(project.name, "ui-template")}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // 导出画布预览图（PNG）。区域 11「选择性导出其他内容」下拉项之一。
  // pixelRatio=2 输出 2 倍图更清晰；stage 未就绪则友好提示而非静默失败。
  const handleExportImage = () => {
    const stage = stageRef.current;
    if (!stage) {
      window.alert("画布尚未就绪，请稍后再试");
      return;
    }
    const url = stage.toDataURL({ pixelRatio: 2 });
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(project.name, "ui-template")}.png`;
    anchor.click();
  };

  const handleAddModule = () => {
    addModule(createDefaultDraft());
  };

  // 复制成品 HTML 到剪贴板（按规划挪到导航栏）。失败兜底提示，不静默吞错。
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(exportPayload.document);
    } catch {
      window.alert("复制失败：浏览器拒绝了剪贴板访问");
    }
  };

  // 保存配置（.json）：完整工程快照，可重新导入复写。与导出的 .html 成品分离——
  // 成品保持纯净给 AI 读，配置文件承载可复写的工程元数据。
  const handleSaveConfig = () => {
    const blob = new Blob([serializeProjectConfig(project)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(project.name, "ui-planner")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // 导入配置：解析失败只弹一句友好提示，绝不让坏文件打崩界面（parseProjectConfig
  // 内部以 { ok:false } 返回而非抛错）。成功则整体复写当前工程。
  const handleImportConfig = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseProjectConfig(String(reader.result ?? ""));
      if (result.project) {
        importProject(result.project);
      } else {
        window.alert(`导入失败：${result.error}`);
      }
    };
    reader.onerror = () => window.alert("导入失败：无法读取该文件");
    reader.readAsText(file);
  };

  // 保存到云端：已绑定后端 id 则覆盖写，否则新建并把返回的 id 绑定到当前工程。
  // 新建后才有 remoteProjectId，之后的「保存」就都走覆盖、不再产生重复项目。
  // newName 仅「另存为」传入：先把工程改成新名字再新建，保证另存出来的是独立命名的副本
  //（重名/空名的拦截在 ProjectSwitcher 里完成，这里只负责落库）。
  const handleSaveToCloud = (forceNew = false, newName?: string) =>
    runCloudAction(async () => {
      setSaving(true);
      try {
        const api = await import("@/utils/projectApi");
        if (!forceNew && remoteProjectId) {
          await api.saveProject(remoteProjectId, project);
        } else {
          const named =
            newName && newName !== project.name
              ? { ...project, name: newName }
              : project;
          const created = await api.createProject(named);
          // 另存为成功后，当前画布即切换为这份新副本（绑定其 id、更新名字）。
          if (newName && newName !== project.name) {
            setProjectMeta({ name: newName });
          }
          setRemoteProjectId(created.id);
        }
        setProjectListVersion((value) => value + 1);
      } finally {
        setSaving(false);
      }
    }, "保存失败");

  // 加载云端项目：拉回完整工程并连同后端 id 一起替换当前画布。
  const handleLoadProject = (id: string) =>
    runCloudAction(async () => {
      const api = await import("@/utils/projectApi");
      const loaded = await api.fetchProject(id);
      loadRemoteProject(id, loaded);
    }, "加载失败");

  // 删除云端项目：删的若是当前正在编辑的项目，解除本地的 id 绑定（工程内容保留为草稿）。
  const handleDeleteProject = (id: string) => {
    if (!window.confirm("确定删除这个云端项目？此操作无法撤销。")) {
      return;
    }
    return runCloudAction(async () => {
      const api = await import("@/utils/projectApi");
      await api.deleteProject(id);
      if (id === remoteProjectId) {
        setRemoteProjectId(null);
      }
      setProjectListVersion((value) => value + 1);
    }, "删除失败");
  };

  const resetLayout = () => {
    setLeftCollapsed(false);
    setRightCollapsed(false);
    setLeftWidth(DEFAULT_LEFT_WIDTH);
    setRightWidth(DEFAULT_RIGHT_WIDTH);
  };

  useEffect(() => {
    const handlePointerUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 布局断点切换时同步两栏的展开态：进入紧凑模式收起（两栏改为浮动叠层），
  // 回到桌面模式则重新展开。依赖是布尔值，仅在「跨越断点」时触发一次——
  // 之前只处理了「进入紧凑」一侧，回到桌面时两栏仍停在 collapsed，
  // 桌面网格两列卡在 0px，画布挤到最左、像是布局崩了。补上「回到桌面」一侧即修复。
  useEffect(() => {
    setLeftCollapsed(isCompactLayout);
    setRightCollapsed(isCompactLayout);
  }, [isCompactLayout]);

  // 画布快捷键：聚焦在输入框/文本域/下拉时一律不拦截，避免打字误触。
  //   N 新增模块 · S 切换吸附 · Esc 取消选择 · Del/⌫ 删除 · ⌘/Ctrl+D 复制
  //   方向键微调选中模块 1px，按住 Shift 为 10px（吸附开启时落点仍会贴合）。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const selected =
        usePlannerStore.getState().project.modules.find(
          (module) => module.id === usePlannerStore.getState().selectedModuleId,
        ) ?? null;

      // ⌘/Ctrl+D 复制：浏览器默认是「加书签」，必须 preventDefault。
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        if (selected) {
          event.preventDefault();
          duplicateModule(selected.id);
        }
        return;
      }

      // ⌘/Ctrl+Z 撤销，⌘/Ctrl+Shift+Z 或 Ctrl+Y 重做。
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      // 其余快捷键都不该与系统/浏览器组合键抢夺。
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      switch (event.key) {
        case "n":
        case "N":
          event.preventDefault();
          handleAddModule();
          break;
        case "s":
        case "S":
          event.preventDefault();
          toggleSnap();
          break;
        case "r":
        case "R":
          if (selected && !selected.locked) {
            event.preventDefault();
            rotateModule(selected.id);
          }
          break;
        case "Escape":
          selectModule(null);
          break;
        case "Delete":
        case "Backspace":
          if (selected && !selected.locked) {
            event.preventDefault();
            deleteModule(selected.id);
          }
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!selected || selected.locked) {
            return;
          }
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          const patch =
            event.key === "ArrowLeft"
              ? { x: selected.x - step }
              : event.key === "ArrowRight"
                ? { x: selected.x + step }
                : event.key === "ArrowUp"
                  ? { y: selected.y - step }
                  : { y: selected.y + step };
          updateModule(selected.id, patch);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // handleAddModule/toggleSnap 等是每次渲染重建的闭包，但都只读取最新 store 快照，
    // 故依赖空数组即可（绑定一次，内部取实时状态），避免反复解绑重绑监听器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startResize =
    (side: "left" | "right") => (event: ReactPointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === "left" ? leftWidth : rightWidth;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth =
          side === "left"
            ? clampSidebarWidth(startWidth + delta)
            : clampSidebarWidth(startWidth - delta);

        if (side === "left") {
          setLeftCollapsed(false);
          setLeftWidth(nextWidth);
        } else {
          setRightCollapsed(false);
          setRightWidth(nextWidth);
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    };

  // 画布、图层栏、属性+预览这三块在紧凑/桌面两种布局里完全一致，只是外层容器不同。
  // 抽成共享变量后两个分支直接引用，避免整段 JSX 逐字复制（改一处不会漏掉另一处）。
  const canvasProps = {
    width: project.width,
    height: project.height,
    backgroundImage: project.backgroundImage,
    modules: project.modules,
    selectedModuleId,
    onSelect: selectModule,
    onAddModule: addModule,
    onUpdateModule: updateModule,
    onDropModule: dropModule,
    leftCollapsed,
    rightCollapsed,
    onQuickAddModule: handleAddModule,
    onToggleLeft: () => setLeftCollapsed((current) => !current),
    onToggleRight: () => setRightCollapsed((current) => !current),
    onResetLayout: resetLayout,
    snapEnabled,
    onToggleSnap: toggleSnap,
    toolbarSlot: (
      <CanvasFloatingActions
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        hasSelection={!!selectedModuleId}
        onRotate={() => selectedModuleId && rotateModule(selectedModuleId)}
        onDuplicate={() =>
          selectedModuleId && duplicateModule(selectedModuleId)
        }
        onReset={handleResetProject}
        onImportConfig={handleImportConfig}
      />
    ),
  };

  const layersPanel = (
    <LayersPanel
      nodes={layeredNodes}
      totalCount={project.modules.length}
      selectedModuleId={selectedModuleId}
      onSelect={selectModule}
      onToggleVisible={(module) =>
        updateModule(module.id, { visible: !module.visible })
      }
      onToggleLocked={(module) =>
        updateModule(module.id, { locked: !module.locked })
      }
      onToggleCollapsed={toggleCollapsed}
      onDuplicate={duplicateModule}
      onDelete={deleteModule}
      onReorder={reorderModule}
    />
  );

  const inspectorAndPreview = (
    <>
      <InspectorPanel
        project={project}
        selectedModule={selectedModule}
        onProjectMetaChange={setProjectMeta}
        onModuleChange={updateModule}
      />
      <PreviewPanel project={project} payload={exportPayload} />
    </>
  );

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#0b1024_0%,#05060f_60%)] text-white">
      {/* 极光帷幕：固定铺满视口的流动光带，位于所有面板之下（见 index.css）。 */}
      <div className="aurora-backdrop" aria-hidden />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
      <TopToolbar
        projectName={project.name}
        moduleCount={project.modules.length}
        brief={project.brief ?? ""}
        width={project.width}
        height={project.height}
        onWidthChange={(value) =>
          setProjectMeta({ width: clampCanvasValue(value, project.width) })
        }
        onHeightChange={(value) =>
          setProjectMeta({ height: clampCanvasValue(value, project.height) })
        }
        backgroundImage={project.backgroundImage}
        onBackgroundChange={(dataUrl) =>
          setProjectMeta({ backgroundImage: dataUrl })
        }
        onProjectNameChange={(name) => setProjectMeta({ name })}
        onBriefChange={(brief) => setProjectMeta({ brief })}
        onDownload={handleDownload}
        onCopyCode={handleCopyCode}
        onSaveConfig={handleSaveConfig}
        onExportImage={handleExportImage}
        projectSlot={
          <ProjectSwitcher
            remoteProjectId={remoteProjectId}
            saving={saving}
            refreshSignal={projectListVersion}
            onSave={() => void handleSaveToCloud()}
            onSaveAsNew={(newName) => void handleSaveToCloud(true, newName)}
            currentName={project.name}
            onLoad={(id) => void handleLoadProject(id)}
            onDelete={(id) => void handleDeleteProject(id)}
          />
        }
      />

      {isCompactLayout ? (
        <div className="relative min-h-0 flex-1 p-5">
          <CanvasBoard
            {...canvasProps}
            onStageReady={(stage) => {
              stageRef.current = stage;
            }}
            stageLabel="沉浸画布模式"
            stageHint="通过浮动工具条展开图层栏或属性栏"
            immersive
          />

          {!leftCollapsed ? (
            <aside className="absolute inset-y-5 left-5 z-30 w-[min(340px,calc(100vw-40px))] overflow-hidden rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              {layersPanel}
            </aside>
          ) : null}

          {!rightCollapsed ? (
            <aside className="absolute inset-y-5 right-5 z-30 w-[min(380px,calc(100vw-40px))] overflow-hidden rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="grid h-full min-h-0 gap-5 bg-night-950/80 backdrop-blur-xl xl:grid-rows-[auto_minmax(0,1fr)]">
                {inspectorAndPreview}
              </div>
            </aside>
          ) : null}
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-0 p-5"
          style={{
            gridTemplateColumns: `${leftCollapsed ? 0 : leftWidth}px ${leftCollapsed ? 0 : 10}px minmax(0,1fr) ${
              rightCollapsed ? 0 : 10
            }px ${rightCollapsed ? 0 : rightWidth}px`,
          }}
        >
          <div
            className="min-w-0 overflow-hidden pr-5"
            style={{ display: leftCollapsed ? "none" : "block" }}
          >
            {layersPanel}
          </div>

          <SidebarHandle
            hidden={leftCollapsed}
            side="left"
            onPointerDown={startResize("left")}
          />

          <div className="min-w-0 px-0 xl:px-0">
            <CanvasBoard
              {...canvasProps}
              onStageReady={(stage) => (stageRef.current = stage)}
            />
          </div>

          <SidebarHandle
            hidden={rightCollapsed}
            side="right"
            onPointerDown={startResize("right")}
          />

          <div
            className="min-w-0 overflow-hidden pl-5"
            style={{ display: rightCollapsed ? "none" : "block" }}
          >
            <div className="grid h-full min-h-0 gap-5 xl:grid-rows-[auto_minmax(0,1fr)]">
              {inspectorAndPreview}
            </div>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}

type SidebarHandleProps = {
  side: "left" | "right";
  hidden: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
};

function SidebarHandle({ side, hidden, onPointerDown }: SidebarHandleProps) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ display: hidden ? "none" : "flex" }}
    >
      <button
        type="button"
        aria-label={side === "left" ? "调整左侧栏宽度" : "调整右侧栏宽度"}
        onPointerDown={onPointerDown}
        className="h-full min-h-[160px] w-[10px] rounded-full bg-white/5 transition hover:bg-aurora-green/25 active:bg-aurora-green/35"
      />
    </div>
  );
}
