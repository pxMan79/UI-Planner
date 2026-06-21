import Konva from "konva";
import {
  Eye,
  Magnet,
  PanelLeft,
  PanelRight,
  Plus,
  ScanSearch,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";

import { ToolbarButton } from "@/components/editor/ToolbarButton";
import { useElementSize } from "@/hooks/useElementSize";
import { ModuleDraft, UIModule } from "@/types/planner";
import {
  Bounds,
  boundsGuides,
  computeSnap,
  Guide,
  MovedEdges,
  snapResizeBounds,
} from "@/utils/snapping";

type CanvasBoardProps = {
  width: number;
  height: number;
  backgroundImage?: string;
  modules: UIModule[];
  selectedModuleId: string | null;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  stageLabel?: string;
  stageHint?: string;
  onSelect: (moduleId: string | null) => void;
  onAddModule: (draft: ModuleDraft) => void;
  onUpdateModule: (moduleId: string, patch: Partial<UIModule>) => void;
  // 拖拽落定：传入最终坐标，由 store 原子地落位 + 解析父子分组（合并/拆分）。
  onDropModule?: (moduleId: string, x: number, y: number) => void;
  onQuickAddModule?: () => void;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onResetLayout?: () => void;
  // 吸附定位开关（由 Editor 持有并持久化，便于键盘快捷键共享同一状态）。
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  // 沉浸(compact)模式：两侧面板浮动隐藏，需要靠浮动栏的开关按钮展开。
  // 桌面模式两栏常驻，开关无意义，故默认不显示这两个按钮。
  immersive?: boolean;
  // 把内部 Konva Stage 暴露给上层，用于导出画布预览图 PNG（区域 11）。
  onStageReady?: (stage: Konva.Stage | null) => void;
  // 注入到底部悬浮工具栏的额外控件（如画布尺寸预设下拉）。
  toolbarSlot?: ReactNode;
};

type DraftRect = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

// 模块最小尺寸：放到 12px 让精细模块（图标位、分隔条等）也能框出来。
const MIN_BOX_SIZE = 12;
const GRID_SIZE = 40;
// 吸附判定阈值（画布坐标系像素）：拖动/缩放时边缘进入此距离即贴合。
const SNAP_THRESHOLD = 7;

export function CanvasBoard({
  width,
  height,
  backgroundImage,
  modules,
  selectedModuleId,
  leftCollapsed = false,
  rightCollapsed = false,
  stageLabel = "框选设计画布",
  stageHint = "空白处拖拽以创建模块",
  onSelect,
  onAddModule,
  onUpdateModule,
  onDropModule,
  onQuickAddModule,
  onToggleLeft,
  onToggleRight,
  onResetLayout,
  snapEnabled = true,
  onToggleSnap,
  immersive = false,
  onStageReady,
  toolbarSlot,
}: CanvasBoardProps) {
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  // 拖动/缩放过程中实时显示的对齐参考线（落定后清空）。
  const [guides, setGuides] = useState<Guide[]>([]);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const groupRefs = useRef<Record<string, Konva.Group | null>>({});
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(viewportRef);

  // 把 Konva stage 暴露给上层（用于导出画布 PNG 快照）。挂载/卸载时同步。
  useEffect(() => {
    onStageReady?.(stageRef.current);
    return () => onStageReady?.(null);
  }, [onStageReady]);

  const gridLines = useMemo(() => {
    const lines: Array<{ points: number[]; key: string }> = [];

    for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
      lines.push({ key: `v-${x}`, points: [x, 0, x, height] });
    }

    for (let y = GRID_SIZE; y < height; y += GRID_SIZE) {
      lines.push({ key: `h-${y}`, points: [0, y, width, y] });
    }

    return lines;
  }, [height, width]);

  const sortedModules = useMemo(
    () => [...modules].sort((left, right) => left.zIndex - right.zIndex),
    [modules],
  );
  // 渲染顺序：按 zIndex 升序，但把「选中模块」挪到最后（最顶层）。
  // 这样选中项在与其他模块重叠的区域也能被指针命中——配合「仅选中项可拖拽」，
  // 实现「点选哪个就拖哪个」，避免顶层模块抢走拖拽。
  const renderModules = useMemo(() => {
    if (!selectedModuleId) {
      return sortedModules;
    }
    const rest = sortedModules.filter(
      (module) => module.id !== selectedModuleId,
    );
    const selected = sortedModules.find(
      (module) => module.id === selectedModuleId,
    );
    return selected ? [...rest, selected] : sortedModules;
  }, [selectedModuleId, sortedModules]);
  const modulesById = useMemo(
    () => Object.fromEntries(modules.map((module) => [module.id, module])),
    [modules],
  );

  // 吸附目标：除被操作模块外、所有可见模块的画布坐标包围盒。
  // 模块虽逻辑上有父子树，但 Konva 里全部平铺在同一坐标系（x/y 即画布坐标），
  // 故直接取 x/y/width/height 即可，无需换算父级偏移。
  const otherBounds = (excludeId: string): Bounds[] =>
    modules
      .filter((module) => module.id !== excludeId && module.visible)
      .map((module) => ({
        x: module.x,
        y: module.y,
        width: module.width,
        height: module.height,
      }));
  useEffect(() => {
    const transformer = transformerRef.current;
    const target = selectedModuleId
      ? groupRefs.current[selectedModuleId]
      : null;

    if (!transformer) {
      return;
    }

    if (target) {
      transformer.nodes([target]);
    } else {
      transformer.nodes([]);
    }

    transformer.getLayer()?.batchDraw();
  }, [selectedModuleId, modules]);

  const stageScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) {
      return 1;
    }

    return Math.min(
      (viewportSize.width - 24) / width,
      (viewportSize.height - 24) / height,
      1,
    );
  }, [height, viewportSize.height, viewportSize.width, width]);

  // 吸附阈值按「屏幕像素」恒定：画布常被缩小渲染（stageScale<1），固定的 7 画布像素
  // 会被压成 4~5 屏幕像素，太窄而难以命中——尤其是画布边界这种「孤零零一条线」。
  // 换算成 屏幕像素 / 缩放比，贴合手感就不随缩放变化（边界与模块间都更容易吸住）。
  const snapThreshold = SNAP_THRESHOLD / stageScale;

  // 模块内文字的「反向缩放」系数：画布常被缩小渲染（stageScale<1），若用固定字号，
  // 14px 字会被一并压成屏幕上的 7px 左右，难以辨认。把字号/内边距乘 1/stageScale，
  // 文字在屏幕上就保持恒定可读大小，不随画布缩放变化——也不影响导出（导出走另一套 CSS）。
  // 上限封顶，避免画布极小、缩放比很低时字大到撑爆小模块。
  const labelScale = Math.min(1 / stageScale, 2.2);
  const nameFontSize = 14 * labelScale;
  const descFontSize = 12 * labelScale;
  const padX = 14 * labelScale;
  const padTop = 12 * labelScale;
  // 说明文字从名称下方一行起排：名称基线 + 一点行距。
  const descTop = padTop + nameFontSize + 6 * labelScale;

  const getPointerPosition = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) {
      return null;
    }

    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointer);
  };

  const handlePointerDown = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event.target !== event.target.getStage()) {
      return;
    }

    const point = getPointerPosition();
    if (!point) {
      return;
    }

    onSelect(null);
    setDraftRect({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  // 画布点击选择：在 Stage 层统一命中，而不是依赖各 Group 的图形命中。
  // 否则大模块的透明填充会盖住其下的小模块，导致被覆盖的小模块永远点不到。
  // 策略——在指针落点上，从所有「包含该点」的可见模块里挑「面积最小」的那个：
  // 被大模块覆盖的小模块面积更小，自然优先被选中；想选大模块就点它未被遮挡的区域。
  const handleStageClick = () => {
    const point = getPointerPosition();
    if (!point) {
      return;
    }

    const hit = modules
      .filter((module) => module.visible)
      .filter(
        (module) =>
          point.x >= module.x &&
          point.x <= module.x + module.width &&
          point.y >= module.y &&
          point.y <= module.y + module.height,
      )
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];

    onSelect(hit ? hit.id : null);
  };

  const handlePointerMove = () => {
    const point = getPointerPosition();
    if (!draftRect || !point) {
      return;
    }

    setDraftRect((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : current,
    );
  };

  const commitDraft = () => {
    if (!draftRect) {
      return;
    }

    const x = Math.min(draftRect.startX, draftRect.currentX);
    const y = Math.min(draftRect.startY, draftRect.currentY);
    const boxWidth = Math.abs(draftRect.currentX - draftRect.startX);
    const boxHeight = Math.abs(draftRect.currentY - draftRect.startY);

    if (boxWidth >= MIN_BOX_SIZE && boxHeight >= MIN_BOX_SIZE) {
      onAddModule({
        name: `新模块 ${modules.length + 1}`,
        description: "",
        semanticTag: "div",
        x,
        y,
        width: boxWidth,
        height: boxHeight,
      });
    }

    setDraftRect(null);
  };

  const draftMetrics = draftRect
    ? {
        x: Math.min(draftRect.startX, draftRect.currentX),
        y: Math.min(draftRect.startY, draftRect.currentY),
        width: Math.abs(draftRect.currentX - draftRect.startX),
        height: Math.abs(draftRect.currentY - draftRect.startY),
      }
    : null;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[32px] border border-white/10 bg-night-900/70 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">
          {stageLabel}
        </h2>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
          {stageHint}
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden p-5"
      >
        <div className="flex h-full items-start justify-center overflow-hidden border border-white/10 bg-white/[0.02] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div
            className="relative overflow-hidden border border-white/10"
            style={{
              width: width * stageScale,
              height: height * stageScale,
              backgroundImage: backgroundImage
                ? `url(${backgroundImage})`
                : undefined,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <Stage
              ref={stageRef}
              width={width * stageScale}
              height={height * stageScale}
              scaleX={stageScale}
              scaleY={stageScale}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={commitDraft}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={commitDraft}
            >
              <Layer listening={false}>
                <Rect
                  width={width}
                  height={height}
                  fill="rgba(255,255,255,0.04)"
                />
                {gridLines.map((line) => (
                  <Line
                    key={line.key}
                    points={line.points}
                    stroke="rgba(52,240,168,0.07)"
                    strokeWidth={1}
                  />
                ))}
              </Layer>

              <Layer>
                {renderModules.map((module) => (
                  <Group
                    key={module.id}
                    ref={(node) => {
                      // 节点卸载时 node 为 null——必须删除条目，
                      // 否则已删除模块的 ref 会永久残留在 groupRefs 里。
                      if (node) {
                        groupRefs.current[module.id] = node;
                      } else {
                        delete groupRefs.current[module.id];
                      }
                    }}
                    x={module.x}
                    y={module.y}
                    clipX={0}
                    clipY={0}
                    clipWidth={module.width}
                    clipHeight={module.height}
                    draggable={selectedModuleId === module.id && !module.locked}
                    visible={module.visible}
                    onClick={handleStageClick}
                    onTap={handleStageClick}
                    onDragMove={(event) => {
                      // 拖动中实时吸附：把 Group 位置贴到最近的对齐线，并显示参考线。
                      // 关掉吸附时仅清空参考线，不改坐标。
                      if (!snapEnabled) {
                        if (guides.length) {
                          setGuides([]);
                        }
                        return;
                      }
                      const node = event.target;
                      const result = computeSnap(
                        {
                          x: node.x(),
                          y: node.y(),
                          width: module.width,
                          height: module.height,
                        },
                        otherBounds(module.id),
                        { width, height },
                        snapThreshold,
                      );
                      node.x(result.x);
                      node.y(result.y);
                      setGuides(result.guides);
                    }}
                    onDragEnd={(event) => {
                      setGuides([]);
                      let nextX = event.target.x();
                      let nextY = event.target.y();
                      // 落定时再吸附一次，保证最终坐标与参考线一致（拖动过程被 React
                      // 重渲打断时 onDragMove 的吸附结果可能未落到 node 上）。
                      if (snapEnabled) {
                        const result = computeSnap(
                          {
                            x: nextX,
                            y: nextY,
                            width: module.width,
                            height: module.height,
                          },
                          otherBounds(module.id),
                          { width, height },
                          snapThreshold,
                        );
                        nextX = result.x;
                        nextY = result.y;
                      }
                      // 优先走 dropModule：落位 + 自动合并/拆分父子分组（原子）。
                      // 未提供时退回纯坐标更新（如沉浸模式下不接分组逻辑也安全）。
                      if (onDropModule) {
                        onDropModule(module.id, nextX, nextY);
                      } else {
                        onUpdateModule(module.id, { x: nextX, y: nextY });
                      }
                    }}
                  >
                    <Rect
                      width={module.width}
                      height={module.height}
                      fill="rgba(0,0,0,0.001)"
                    />
                    <Rect
                      width={module.width}
                      height={module.height}
                      fill={`${module.accent}22`}
                      stroke={
                        selectedModuleId === module.id
                          ? "#f8fbff"
                          : module.accent
                      }
                      strokeWidth={selectedModuleId === module.id ? 2.2 : 1.4}
                      cornerRadius={18}
                      shadowBlur={selectedModuleId === module.id ? 18 : 8}
                      shadowColor={module.accent}
                    />
                    <Text
                      x={padX}
                      y={padTop}
                      width={Math.max(module.width - padX * 2, 8)}
                      text={module.name}
                      fontSize={nameFontSize}
                      fontStyle="bold"
                      fill="#f8fbff"
                      ellipsis
                      listening={false}
                    />
                    {module.description.trim() ? (
                      <Text
                        x={padX}
                        y={descTop}
                        width={Math.max(module.width - padX * 2, 8)}
                        height={Math.max(module.height - descTop - padTop, 0)}
                        text={module.description}
                        fontSize={descFontSize}
                        lineHeight={1.45}
                        fill="rgba(226,232,240,0.88)"
                        wrap="word"
                        ellipsis
                        listening={false}
                      />
                    ) : null}
                  </Group>
                ))}

                {draftMetrics ? (
                  <Rect
                    x={draftMetrics.x}
                    y={draftMetrics.y}
                    width={draftMetrics.width}
                    height={draftMetrics.height}
                    fill="rgba(52,240,168,0.16)"
                    stroke="#34f0a8"
                    dash={[10, 6]}
                    cornerRadius={16}
                  />
                ) : null}

                {/* 吸附参考线：极光绿细线，仅在拖动/缩放命中对齐时短暂出现。
                    listening=false 不拦截指针，strokeScaleEnabled=false 让线宽
                    不随 stageScale 变粗（保持恒定屏幕观感）。
                    贴画布四边的参考线（position=0 或 画布宽/高）正好落在 stage 最外圈，
                    而画布外层那层 1px CSS 边框（border-white/10）盖在最外圈像素上，会把
                    贴边的细线整条挡住、看起来「没有线」。故把贴边的 position 向画布内侧
                    夹 2 个屏幕像素（换算成画布坐标 = 2 / stageScale）躲开边框，整条线
                    就能完整显示。线加粗到 1.5、并描一层深色细边，在网格上更醒目。 */}
                {guides.map((guide, index) => {
                  const inset = 2 / stageScale;
                  const max = guide.axis === "x" ? width : height;
                  const pos = Math.min(
                    Math.max(guide.position, inset),
                    max - inset,
                  );
                  return (
                    <Line
                      key={`guide-${guide.axis}-${index}`}
                      points={
                        guide.axis === "x"
                          ? [pos, guide.start, pos, guide.end]
                          : [guide.start, pos, guide.end, pos]
                      }
                      stroke="#34f0a8"
                      strokeWidth={1.5}
                      dash={[6, 4]}
                      shadowColor="rgba(0,0,0,0.6)"
                      shadowBlur={2}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                  );
                })}

                <Transformer
                  ref={transformerRef}
                  rotateEnabled={false}
                  boundBoxFunc={(oldBox, newBox) =>
                    newBox.width < MIN_BOX_SIZE || newBox.height < MIN_BOX_SIZE
                      ? oldBox
                      : newBox
                  }
                  onTransform={() => {
                    // 缩放过程中实时显示参考线：用「原始模块尺寸 × 当前缩放」折算出
                    // 画布坐标包围盒——Konva Group 自身没有 width/height 属性
                    // （node.width() 恒为 0），必须取模块数据，否则参考线永远算不出。
                    if (!snapEnabled) {
                      return;
                    }
                    const node = transformerRef.current?.nodes()[0];
                    const moduleId = selectedModuleId;
                    const targetModule = moduleId
                      ? modulesById[moduleId]
                      : null;
                    if (!node || !moduleId || !targetModule) {
                      return;
                    }
                    const live: Bounds = {
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(
                        MIN_BOX_SIZE,
                        targetModule.width * node.scaleX(),
                      ),
                      height: Math.max(
                        MIN_BOX_SIZE,
                        targetModule.height * node.scaleY(),
                      ),
                    };
                    // 把被拖动的边吸附后再算参考线，让对齐反馈在松手前就出现。
                    const eps = 0.5;
                    const moved: MovedEdges = {
                      left: Math.abs(live.x - targetModule.x) > eps,
                      right:
                        Math.abs(
                          live.x + live.width -
                            (targetModule.x + targetModule.width),
                        ) > eps,
                      top: Math.abs(live.y - targetModule.y) > eps,
                      bottom:
                        Math.abs(
                          live.y + live.height -
                            (targetModule.y + targetModule.height),
                        ) > eps,
                    };
                    const snappedLive = snapResizeBounds(
                      live,
                      moved,
                      otherBounds(moduleId),
                      { width, height },
                      snapThreshold,
                      MIN_BOX_SIZE,
                    );
                    setGuides(
                      boundsGuides(snappedLive, otherBounds(moduleId), {
                        width,
                        height,
                      }),
                    );
                  }}
                  onTransformEnd={() => {
                    setGuides([]);
                    const node = transformerRef.current?.nodes()[0];
                    const moduleId = selectedModuleId;
                    const targetModule = moduleId
                      ? modulesById[moduleId]
                      : null;
                    if (!node || !moduleId || !targetModule) {
                      return;
                    }

                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    let next: Bounds = {
                      x: node.x(),
                      y: node.y(),
                      width: Math.max(MIN_BOX_SIZE, targetModule.width * scaleX),
                      height: Math.max(
                        MIN_BOX_SIZE,
                        targetModule.height * scaleY,
                      ),
                    };

                    // 只吸附实际被拖动的那几条边。transformEnd 时 getActiveAnchor()
                    // 已被清空、取不到锚点，故改为「比对新旧边坐标」来判定哪条边动了：
                    // 哪条边的位置相对原模块发生了变化，就吸附哪条边。
                    if (snapEnabled) {
                      const eps = 0.5;
                      const moved: MovedEdges = {
                        left: Math.abs(next.x - targetModule.x) > eps,
                        right:
                          Math.abs(
                            next.x + next.width -
                              (targetModule.x + targetModule.width),
                          ) > eps,
                        top: Math.abs(next.y - targetModule.y) > eps,
                        bottom:
                          Math.abs(
                            next.y + next.height -
                              (targetModule.y + targetModule.height),
                          ) > eps,
                      };
                      next = snapResizeBounds(
                        next,
                        moved,
                        otherBounds(moduleId),
                        { width, height },
                        snapThreshold,
                        MIN_BOX_SIZE,
                      );
                    }

                    onUpdateModule(moduleId, {
                      x: next.x,
                      y: next.y,
                      width: next.width,
                      height: next.height,
                    });

                    node.scaleX(1);
                    node.scaleY(1);
                  }}
                />
              </Layer>
            </Stage>
          </div>
        </div>

        {/* 悬浮快捷工具栏：贴画布区域底部居中（对齐规划稿 top:856 的底部居中意图）。
            放在 viewportRef(relative) 内而非画布缩放层里，避免被 stageScale 影响尺寸。
            收起图层/属性仅沉浸模式显示——桌面两栏常驻时开关无意义。 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-5">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {/* 吸附开关放最左：开启时高亮极光绿，与右端缩放指示形成对称收尾。 */}
            <ToolbarButton
              onClick={onToggleSnap}
              label={snapEnabled ? "吸附中" : "自由"}
              icon={<Magnet className="h-4 w-4" />}
              active={snapEnabled}
              ariaPressed={snapEnabled}
              title="切换吸附定位 / 自由模式（快捷键 S）"
            />
            <ToolbarButton
              onClick={onQuickAddModule}
              label="新增模块"
              icon={<Plus className="h-4 w-4" />}
              title="新增模块（快捷键 N）"
            />
            {immersive ? (
              <>
                <ToolbarButton
                  onClick={onToggleLeft}
                  label={leftCollapsed ? "展开图层" : "收起图层"}
                  icon={<PanelLeft className="h-4 w-4" />}
                />
                <ToolbarButton
                  onClick={onToggleRight}
                  label={rightCollapsed ? "展开属性" : "收起属性"}
                  icon={<PanelRight className="h-4 w-4" />}
                />
              </>
            ) : null}
            <ToolbarButton
              onClick={onResetLayout}
              label="重置视图"
              icon={<ScanSearch className="h-4 w-4" />}
            />
            {/* 画布尺寸预设下拉：由 Editor 注入（区域 1 的宽高调整挪到此处工具栏）。 */}
            {toolbarSlot}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              <Eye className="h-4 w-4 text-emerald-300" />
              缩放 {Math.round(stageScale * 100)}%
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
