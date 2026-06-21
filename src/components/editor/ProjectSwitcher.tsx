import {
  Check,
  ChevronDown,
  FilePlus2,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "@/utils/projectApi";

type ProjectSwitcherProps = {
  // 当前工程绑定的后端 id（null=尚未保存的本地草稿）。
  remoteProjectId: string | null;
  saving: boolean;
  // 刷新信号：每次保存/新建/删除后由父组件自增，触发列表重拉，
  // 保证下拉即使保持打开也能看到最新项目（不只在打开瞬间刷新）。
  refreshSignal: number;
  // 「保存」：有 id 则覆盖写，无 id 则新建。具体逻辑在 Editor。
  onSave: () => void;
  // 加载某个后端项目到画布。
  onLoad: (id: string) => void;
  // 另存为新项目（强制走新建，断开当前 id 绑定）。必须传入一个新名字——
  // 「另存为」要求改名，不允许同名另存，避免云端出现一堆同名副本难以区分。
  onSaveAsNew: (name: string) => void;
  // 当前工程名：另存为时作为改名输入的初始值，并用于判定「是否真的改了名」。
  currentName: string;
  // 删除某个后端项目。
  onDelete: (id: string) => void;
};

export function ProjectSwitcher({
  remoteProjectId,
  saving,
  refreshSignal,
  onSave,
  onLoad,
  onSaveAsNew,
  currentName,
  onDelete,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「另存为」改名态：null=未在另存为；字符串=正在输入新名字。
  // 进入该态会把保存/另存为两按钮替换成「名字输入 + 确认/取消」。
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { fetchProjectList } = await import("@/utils/projectApi");
      setList(await fetchProjectList());
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法连接到存储服务");
    } finally {
      setLoading(false);
    }
  }, []);

  // 打开下拉时拉一次最新列表；refreshSignal 变化（父组件保存/删除后自增）也重拉，
  // 这样即使下拉保持打开，列表也会随云端变化更新。
  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh, refreshSignal]);

  // 点击面板外部即关闭，符合下拉菜单的常规交互。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="切换项目"
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-slate-200 transition hover:border-aurora-green/40 hover:bg-aurora-green/10"
      >
        项目
        <ChevronDown
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-80 rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          {/* 保存 / 另存为：默认两按钮。保存=覆盖当前同名工程（有 id 才可用）。
              另存为=必须改名后新建：点击进入「改名输入」态，校验新名字非空、
              与当前名不同、且不与已有云端项目重名，才允许确认——杜绝同名副本。 */}
          {saveAsName === null ? (
            <div className="flex items-center gap-2 pb-3">
              <button
                type="button"
                onClick={() => {
                  onSave();
                }}
                disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-sm text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-300/15 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </button>
              <button
                type="button"
                onClick={() => setSaveAsName(currentName)}
                disabled={saving}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-aurora-green/30 bg-aurora-green/10 text-sm text-aurora-green transition hover:border-aurora-green/50 hover:bg-aurora-green/15 disabled:opacity-60"
              >
                <FilePlus2 className="h-4 w-4" />
                另存为
              </button>
            </div>
          ) : (
            <SaveAsForm
              initialName={saveAsName}
              currentName={currentName}
              existingNames={list.map((item) => item.name)}
              saving={saving}
              onCancel={() => setSaveAsName(null)}
              onConfirm={(name) => {
                onSaveAsNew(name);
                setSaveAsName(null);
              }}
            />
          )}

          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
              云端项目
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              aria-label="刷新列表"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-aurora-green"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-200">
              {error}
            </div>
          ) : null}

          {!error && !loading && list.length === 0 ? (
            <div className="px-1 py-4 text-center text-xs text-slate-500">
              还没有云端项目，点上方「保存」创建第一个。
            </div>
          ) : null}

          <ul className="thin-scrollbar max-h-72 space-y-1 overflow-auto">
            {list.map((item) => {
              const active = item.id === remoteProjectId;
              return (
                <li key={item.id}>
                  <div
                    className={`group flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                      active
                        ? "border-aurora-green/40 bg-aurora-green/10"
                        : "border-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onLoad(item.id);
                        setOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {active ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-aurora-green" />
                        ) : null}
                        <span className="truncate text-sm text-white">
                          {item.name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {item.moduleCount} 个模块 · {item.width}×{item.height}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      aria-label={`删除项目 ${item.name}`}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 opacity-0 transition hover:bg-rose-400/15 hover:text-rose-300 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// 「另存为」改名表单：输入新名字并实时校验，只有合法（非空、与当前名不同、
// 不与已有云端项目重名）时确认按钮才可用，从源头杜绝同名另存。
type SaveAsFormProps = {
  initialName: string;
  currentName: string;
  existingNames: string[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

function SaveAsForm({
  initialName,
  currentName,
  existingNames,
  saving,
  onCancel,
  onConfirm,
}: SaveAsFormProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 打开即聚焦并选中，方便直接改名。
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  // 重名判定忽略大小写与首尾空白，与后端「按名区分」的直觉一致。
  const isDuplicate = existingNames.some(
    (existing) => existing.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const isSameAsCurrent = trimmed === currentName.trim();
  const error = !trimmed
    ? "请输入项目名"
    : isSameAsCurrent
      ? "另存为需要一个不同的名字"
      : isDuplicate
        ? "已有同名云端项目，请换个名字"
        : null;
  const canConfirm = !error && !saving;

  const submit = () => {
    if (canConfirm) {
      onConfirm(trimmed);
    }
  };

  return (
    <div className="pb-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          placeholder="另存为新名字"
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-aurora-green/55 focus:ring-2 focus:ring-aurora-green/20"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canConfirm}
          aria-label="确认另存为"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aurora-green/30 bg-aurora-green/10 text-aurora-green transition hover:border-aurora-green/50 hover:bg-aurora-green/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消另存为"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 px-1 text-[11px] text-amber-300/90">{error}</p>
      ) : null}
    </div>
  );
}
