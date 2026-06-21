import {
  CopyPlus,
  Eraser,
  FolderInput,
  Redo2,
  RotateCw,
  Undo2,
} from "lucide-react";
import { useRef } from "react";

import { ToolbarButton } from "@/components/editor/ToolbarButton";

// 画布底部悬浮工具栏里注入的一组动作（toolbarSlot）：撤销/重做 · 旋转 · 复制 ·
// 重置示例 · 导入配置。原先拆成 4 个文件，但它们在 Editor 里总是成组出现、
// 样式也一致，合并到一处更省心——改动顺序/样式只需动这一个文件。
type CanvasFloatingActionsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // 未选中模块时旋转/复制禁用置灰。
  hasSelection: boolean;
  onRotate: () => void;
  onDuplicate: () => void;
  onReset: () => void;
  onImportConfig: (file: File) => void;
};

export function CanvasFloatingActions({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelection,
  onRotate,
  onDuplicate,
  onReset,
  onImportConfig,
}: CanvasFloatingActionsProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportConfig(file);
    }
    // 清空 value：否则连续导入同名文件不会再触发 change 事件。
    event.target.value = "";
  };

  return (
    <>
      <ToolbarButton
        icon={<Undo2 className="h-4 w-4" />}
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销（Ctrl+Z）"
        ariaLabel="撤销（Ctrl+Z）"
      />
      <ToolbarButton
        icon={<Redo2 className="h-4 w-4" />}
        onClick={onRedo}
        disabled={!canRedo}
        title="重做（Ctrl+Shift+Z）"
        ariaLabel="重做（Ctrl+Shift+Z）"
      />
      <ToolbarButton
        icon={<RotateCw className="h-4 w-4" />}
        onClick={onRotate}
        disabled={!hasSelection}
        title="旋转 90°（宽高对调，快捷键 R）"
        ariaLabel="旋转选中模块 90 度"
      />
      <ToolbarButton
        icon={<CopyPlus className="h-4 w-4" />}
        onClick={onDuplicate}
        disabled={!hasSelection}
        title="复制选中模块（Ctrl+D）"
        ariaLabel="复制选中模块"
      />
      <ToolbarButton
        icon={<Eraser className="h-4 w-4" />}
        label="重置示例"
        onClick={onReset}
        tone="warn"
      />
      <ToolbarButton
        icon={<FolderInput className="h-4 w-4" />}
        label="导入配置"
        onClick={() => importInputRef.current?.click()}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportPick}
        className="hidden"
      />
    </>
  );
}
