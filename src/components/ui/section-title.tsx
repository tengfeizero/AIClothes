interface SectionTitleProps {
  children: React.ReactNode;
  /** 间距/布局类，默认 mb-2；与右侧操作同处一行时传空字符串 */
  className?: string;
}

/** 全站统一的区块标题样式 */
export function SectionTitle({ children, className = 'mb-2' }: SectionTitleProps) {
  return <div className={`text-[13px] font-medium text-gray-700 ${className}`}>{children}</div>;
}
