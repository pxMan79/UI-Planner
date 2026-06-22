import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createDefaultProject } from "@/utils/defaultProject";
import { CanvasProject, ModuleDraft, UIModule } from "@/types/planner";
import { lightenHex, randomAccent } from "@/utils/color";
import {
  collectDescendantIds,
  resolveDropParent,
  wouldCreateCycle,
} from "@/utils/moduleTree";

type PlannerStore = {
  project: CanvasProject;
  selectedModuleId: string | null;
  // 撤销/重做历史：past 是更早的工程快照栈，future 是被撤销出去、可重做的快照栈。
  // 均不持久化（见 partialize），刷新后清空——历史是会话内的临时态。
  past: CanvasProject[];
  future: CanvasProject[];
  undo: () => void;
  redo: () => void;
  // 旋转模块：宽高对调、中心不变（矩形左右旋转 90° 视觉等价，故单向即可）。
  rotateModule: (moduleId: string) => void;
  // 当前工程在后端的 id（null=还没存过/纯本地草稿）。持久化，刷新后仍记得在编辑哪个。
  remoteProjectId: string | null;
  setRemoteProjectId: (id: string | null) => void;
  // 从后端载入一份工程：整体替换当前工程，并记下它的后端 id。
  loadRemoteProject: (id: string, project: CanvasProject) => void;
  selectModule: (moduleId: string | null) => void;
  setProjectMeta: (
    payload: Partial<
      Pick<CanvasProject, "name" | "width" | "height" | "backgroundImage" | "brief">
    >,
  ) => void;
  resetProject: () => void;
  importProject: (project: CanvasProject) => void;
  addModule: (draft: ModuleDraft) => void;
  updateModule: (moduleId: string, patch: Partial<UIModule>) => void;
  deleteModule: (moduleId: string) => void;
  duplicateModule: (moduleId: string) => void;
  // 图层栏拖拽重排：把 draggedId 放到 targetId 的「之前/之后/内部」。
  // before/after=同层重排（继承 target 的父），inside=嵌套成 target 的子模块。
  // 一次性完成「改父 + 改同层顺序(zIndex)」，与画布拖拽合并互补。
  reorderModule: (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => void;
  // 画布拖拽落点：先落定新坐标，再按重叠关系自动合并/拆分父子分组（原子操作）。
  dropModule: (moduleId: string, x: number, y: number) => void;
  // 折叠/展开某父模块在图层栏的子树。
  toggleCollapsed: (moduleId: string) => void;
};

const createModuleId = () => `module-${Math.random().toString(36).slice(2, 9)}`;

const stampProject = (project: CanvasProject): CanvasProject => ({
  ...project,
  updatedAt: new Date().toISOString(),
});

// 撤销历史最多保留的快照数——封顶避免长会话里内存无限增长。
const HISTORY_LIMIT = 100;

// 一次可撤销的工程变更：把变更前的工程压入 past、清空 future（新操作会废弃
// 原本的「重做」分支），再落定新工程。所有改动模块/项目元数据的 action 都走这里，
// 这样 undo/redo 只需在 past/future 之间搬运快照即可。
const withHistory = (
  state: { project: CanvasProject; past: CanvasProject[] },
  nextProject: CanvasProject,
  extra: Record<string, unknown> = {},
) => ({
  past: [...state.past, state.project].slice(-HISTORY_LIMIT),
  future: [] as CanvasProject[],
  project: nextProject,
  ...extra,
});

const maxZIndex = (modules: UIModule[]) =>
  modules.reduce((max, item) => Math.max(max, item.zIndex), 0);

const initialProject = createDefaultProject();

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set) => ({
      project: initialProject,
      // 初次打开默认不选中任何模块：让右侧落到「项目属性 + 快捷键」空态，
      // 而不是一上来就选中示例里的 intro-banner（用户要求）。
      selectedModuleId: null,
      past: [],
      future: [],
      remoteProjectId: null,
      undo: () =>
        set((state) => {
          if (!state.past.length) {
            return state;
          }
          const previous = state.past[state.past.length - 1];
          return {
            past: state.past.slice(0, -1),
            future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
            project: previous,
            // 选中项可能指向已被撤销掉的模块，校正到仍存在的项（否则属性栏空引用）。
            selectedModuleId: previous.modules.some(
              (module) => module.id === state.selectedModuleId,
            )
              ? state.selectedModuleId
              : (previous.modules[0]?.id ?? null),
          };
        }),
      redo: () =>
        set((state) => {
          if (!state.future.length) {
            return state;
          }
          const next = state.future[0];
          return {
            past: [...state.past, state.project].slice(-HISTORY_LIMIT),
            future: state.future.slice(1),
            project: next,
            selectedModuleId: next.modules.some(
              (module) => module.id === state.selectedModuleId,
            )
              ? state.selectedModuleId
              : (next.modules[0]?.id ?? null),
          };
        }),
      rotateModule: (moduleId) =>
        set((state) => {
          const target = state.project.modules.find(
            (module) => module.id === moduleId,
          );
          if (!target) {
            return state;
          }
          // 宽高对调、中心保持不变：新左上角 = 旧中心 ∓ 新半宽/半高。
          const centerX = target.x + target.width / 2;
          const centerY = target.y + target.height / 2;
          const nextWidth = target.height;
          const nextHeight = target.width;
          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: state.project.modules.map((module) =>
                module.id === moduleId
                  ? {
                      ...module,
                      width: nextWidth,
                      height: nextHeight,
                      x: centerX - nextWidth / 2,
                      y: centerY - nextHeight / 2,
                    }
                  : module,
              ),
            }),
          );
        }),
      selectModule: (selectedModuleId) => set({ selectedModuleId }),
      setProjectMeta: (payload) =>
        set((state) =>
          withHistory(
            state,
            stampProject({
              ...state.project,
              ...payload,
            }),
          ),
        ),
      resetProject: () => {
        const fresh = createDefaultProject();
        set({
          project: fresh,
          // 与初次打开保持一致：默认不选中，落到项目属性空态。
          selectedModuleId: null,
          // 重置回到全新本地草稿，与任何后端项目脱钩，历史也一并清空。
          past: [],
          future: [],
          remoteProjectId: null,
        });
      },
      importProject: (project) =>
        set({
          project: stampProject(project),
          selectedModuleId: project.modules[0]?.id ?? null,
          // 导入的 .json 是「别人分享的成品」，视为新的本地草稿——
          // 不绑定到后端 id，避免一保存就覆盖了对方的项目，历史也清空。
          past: [],
          future: [],
          remoteProjectId: null,
        }),
      addModule: (draft) =>
        set((state) => {
          const moduleId = createModuleId();
          // accent 取色优先级：① draft 显式指定 → 用它；② 当前有选中模块 →
          // 以它的颜色为基底淡化一档（同色系层次，区分父子/相邻关系）；
          // ③ 都没有 → 从预设调色板随机取一个（连续新增颜色各异，比清一色绿好认）。
          const selected = state.project.modules.find(
            (module) => module.id === state.selectedModuleId,
          );
          const accent =
            draft.accent ??
            (selected ? lightenHex(selected.accent, 0.32) : randomAccent());
          const nextModule: UIModule = {
            id: moduleId,
            accent,
            description: draft.description,
            height: draft.height,
            locked: false,
            name: draft.name,
            semanticTag: draft.semanticTag,
            visible: true,
            width: draft.width,
            x: draft.x,
            y: draft.y,
            zIndex: maxZIndex(state.project.modules) + 1,
            parentId: draft.parentId ?? null,
            collapsed: false,
          };

          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: [...state.project.modules, nextModule],
            }),
            { selectedModuleId: moduleId },
          );
        }),
      updateModule: (moduleId, patch) =>
        set((state) =>
          withHistory(
            state,
            stampProject({
              ...state.project,
              modules: state.project.modules.map((module) =>
                module.id === moduleId ? { ...module, ...patch } : module,
              ),
            }),
          ),
        ),
      deleteModule: (moduleId) =>
        set((state) => {
          // 删除父模块时连带删除其全部子孙，避免遗留「孤儿」指向已不存在的父。
          const toRemove = new Set([
            moduleId,
            ...collectDescendantIds(state.project.modules, moduleId),
          ]);
          const nextModules = state.project.modules.filter(
            (module) => !toRemove.has(module.id),
          );
          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: nextModules,
            }),
            {
              selectedModuleId: toRemove.has(state.selectedModuleId ?? "")
                ? (nextModules[0]?.id ?? null)
                : state.selectedModuleId,
            },
          );
        }),
      duplicateModule: (moduleId) =>
        set((state) => {
          const target = state.project.modules.find(
            (module) => module.id === moduleId,
          );
          if (!target) {
            return state;
          }

          const duplicateId = createModuleId();
          const duplicate: UIModule = {
            ...target,
            id: duplicateId,
            name: `${target.name} 副本`,
            x: target.x + 24,
            y: target.y + 24,
            zIndex: maxZIndex(state.project.modules) + 1,
            // 副本保持与原模块同一个父分组，但自身不带子树（子孙不复制）。
            collapsed: false,
          };

          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: [...state.project.modules, duplicate],
            }),
            { selectedModuleId: duplicateId },
          );
        }),
      reorderModule: (draggedId, targetId, position) =>
        set((state) => {
          if (draggedId === targetId) {
            return state;
          }
          const modules = state.project.modules;
          const target = modules.find((module) => module.id === targetId);
          if (!target) {
            return state;
          }

          // inside=挂到 target 之下；before/after=与 target 同层（共用 target 的父）。
          const nextParent =
            position === "inside" ? targetId : target.parentId;
          // 防环：不能挂到自身或子孙下，否则树断裂。挡掉则整体放弃本次操作。
          if (wouldCreateCycle(modules, draggedId, nextParent)) {
            return state;
          }

          // 先把 dragged 的父指向定下来，再在「目标层」内按期望相对位置重排 zIndex。
          const reParented = modules.map((module) =>
            module.id === draggedId
              ? { ...module, parentId: nextParent }
              : module,
          );

          // inside 挂进去后排到该父的末尾（最上层）即可，无需精确插位。
          if (position === "inside") {
            const siblings = reParented.filter(
              (module) => module.parentId === nextParent,
            );
            const zIndexById = new Map(
              [...siblings]
                .sort((a, b) => a.zIndex - b.zIndex)
                .filter((module) => module.id !== draggedId)
                .concat(reParented.find((m) => m.id === draggedId)!)
                .map((module, index) => [module.id, index + 1]),
            );
            return withHistory(
              state,
              stampProject({
                ...state.project,
                modules: reParented.map((module) =>
                  zIndexById.has(module.id)
                    ? { ...module, zIndex: zIndexById.get(module.id)! }
                    : module,
                ),
              }),
            );
          }

          // before/after：在同层兄弟里把 dragged 抽出，插到 target 前/后，再归一化 zIndex。
          const siblings = reParented
            .filter((module) => module.parentId === nextParent)
            .sort((a, b) => a.zIndex - b.zIndex);
          const withoutDragged = siblings.filter(
            (module) => module.id !== draggedId,
          );
          const draggedModule = reParented.find((m) => m.id === draggedId)!;
          const targetIndex = withoutDragged.findIndex(
            (module) => module.id === targetId,
          );
          const insertAt =
            position === "before" ? targetIndex : targetIndex + 1;
          withoutDragged.splice(insertAt, 0, draggedModule);

          const zIndexById = new Map(
            withoutDragged.map((module, index) => [module.id, index + 1]),
          );

          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: reParented.map((module) =>
                zIndexById.has(module.id)
                  ? { ...module, zIndex: zIndexById.get(module.id)! }
                  : module,
              ),
            }),
          );
        }),
      dropModule: (moduleId, x, y) =>
        set((state) => {
          // 1) 先把模块落到新坐标——resolveDropParent 按重叠比例判断归属，
          //    必须用「落定后」的坐标来算，否则拖到一半的旧坐标会算错父模块。
          const moved = state.project.modules.map((module) =>
            module.id === moduleId ? { ...module, x, y } : module,
          );
          // 2) 用更新后的坐标解析落点父模块（重叠达阈值→合并为子模块；否则顶层）。
          const nextParentId = resolveDropParent(moved, moduleId);
          // 防环兜底：resolveDropParent 已排除自身与子孙，这里再保一道。
          const parentId = wouldCreateCycle(moved, moduleId, nextParentId)
            ? null
            : nextParentId;

          return withHistory(
            state,
            stampProject({
              ...state.project,
              modules: moved.map((module) =>
                module.id === moduleId ? { ...module, parentId } : module,
              ),
            }),
          );
        }),
      toggleCollapsed: (moduleId) =>
        set((state) =>
          withHistory(
            state,
            stampProject({
              ...state.project,
              modules: state.project.modules.map((module) =>
                module.id === moduleId
                  ? { ...module, collapsed: !module.collapsed }
                  : module,
              ),
            }),
          ),
        ),
      loadRemoteProject: (id, project) =>
        set({
          project,
          selectedModuleId: project.modules[0]?.id ?? null,
          remoteProjectId: id,
          // 载入云端工程＝全新起点，旧的撤销历史不再适用，清空。
          past: [],
          future: [],
        }),
      setRemoteProjectId: (id) => set({ remoteProjectId: id }),
    }),
    {
      name: "ui-planner-store",
      version: 2,
      partialize: (state) => ({
        project: state.project,
        remoteProjectId: state.remoteProjectId,
      }),
      // 旧版本持久化的模块没有 parentId/collapsed 字段，迁移时补默认值，
      // 避免老用户的 localStorage 数据进来后字段缺失导致树逻辑出错。
      migrate: (persisted) => {
        const state = persisted as { project?: CanvasProject } | undefined;
        if (state?.project?.modules) {
          state.project.modules = state.project.modules.map((module) => ({
            ...module,
            parentId: module.parentId ?? null,
            collapsed: module.collapsed ?? false,
          }));
        }
        return state as never;
      },
    },
  ),
);
