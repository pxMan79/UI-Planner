import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// 工具栏胶囊按钮基元：画布底部悬浮栏（吸附/新增/撤销/旋转/复制…）与各 action
// 组件共用同一套样式，避免那一长串 className 在每个按钮里逐字复制。
//   · active —— 开关型高亮（如吸附开启），覆盖默认描边/底色为极光绿。
//   · disabled —— 置灰禁用，并屏蔽 hover（enabled:hover 仅在可用时生效）。
//   · tone="warn" —— 危险/低频操作（如重置示例）用琥珀色 hover 区分。
type ToolbarButtonProps = {
  icon: ReactNode;
  // 省略 label 即为「仅图标」按钮（旋转/复制/撤销）。
  label?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "default" | "warn";
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
};

export function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  tone = "default",
  title,
  ariaLabel,
  ariaPressed,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition",
        active
          ? "border-aurora-green/50 bg-aurora-green/15 font-medium text-aurora-green"
          : [
              "border-white/10 bg-white/5 text-slate-100 disabled:cursor-not-allowed disabled:text-slate-600",
              tone === "warn"
                ? "enabled:hover:border-amber-300/40 enabled:hover:bg-amber-300/10"
                : "enabled:hover:border-aurora-green/40 enabled:hover:bg-aurora-green/10",
            ],
      )}
    >
      {icon}
      {label}
    </button>
  );
}
