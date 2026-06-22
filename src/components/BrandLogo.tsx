// UI Planner 品牌标识：极光配色（绿→青→蓝）的便当式布局标记，呼应「在画布上
// 规划 UI 区域」的产品语义。仅渲染标记本体，容器样式由调用方提供（如顶栏徽章）。
// 与 public/favicon.svg 同源——favicon 是「夜空底 + 标记」的完整图标，这里是标记本身。
type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="up-aurora-mark"
          x1="0"
          y1="0"
          x2="18"
          y2="18"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#34f0a8" />
          <stop offset="0.5" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="18" height="4.5" rx="1.6" fill="url(#up-aurora-mark)" />
      <rect x="0" y="6" width="10.5" height="12" rx="2.2" fill="#34f0a8" />
      <rect x="12" y="6" width="6" height="5.25" rx="1.6" fill="#22d3ee" />
      <rect x="12" y="12.75" width="6" height="5.25" rx="1.6" fill="#38bdf8" />
    </svg>
  );
}
