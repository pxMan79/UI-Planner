import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 把项目名规整为安全的下载文件名（基名，不含扩展名）：空白折成连字符，
// 全空则退回 fallback。导出 .html / .png / .json 共用，避免三处重复同一段。
export function safeFileName(name: string, fallback: string) {
  return name.replace(/\s+/g, "-") || fallback
}
