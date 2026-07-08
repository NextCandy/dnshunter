/**
 * DeckMark — dshunter 品牌标志（雷达准星）。
 *
 * 同心雷达环 + 四向准星刻度 + 扫描臂 + 中心信号点，
 * 呼应品牌语义："域名猎手（瞄准锁定）· 指挥台（雷达扫描）"。
 * 用 currentColor 上色，由容器决定色彩与尺寸。
 */
export function DeckMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false">
      {/* 外环 / 内环：雷达 */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
      <circle cx="12" cy="12" r="5.2" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      {/* 四向准星刻度：瞄准 */}
      <path
        d="M12 2.2V4.4M12 19.6V21.8M2.2 12H4.4M19.6 12H21.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* 扫描臂 */}
      <path
        d="M12 12 16.7 8.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* 中心信号点：锁定的目标 */}
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
    </svg>
  );
}
