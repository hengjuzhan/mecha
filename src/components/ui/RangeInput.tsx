import { useEffect, useRef, useState } from "react";

/**
 * 防抖滑块：拖拽时用本地 state 即时响应（不触发全站重渲染），
 * 100ms 防抖后才调用 onChange 写入 store；松手时立即提交最终值。
 */
export function RangeInput({
  value,
  min,
  max,
  step,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const debounceRef = useRef(0);

  // 非拖拽时同步外部值
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  const update = (v: number) => {
    setLocal(v); // 即时视觉反馈，不触发任何外部重渲染
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => onChange(v), 100);
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={local}
      className={className}
      aria-label={ariaLabel}
      onChange={(e) => update(Number(e.target.value))}
      onPointerDown={() => { dragging.current = true; }}
      onPointerUp={() => {
        dragging.current = false;
        window.clearTimeout(debounceRef.current);
        onChange(local); // 松手立即提交
      }}
      onPointerCancel={() => {
        dragging.current = false;
        window.clearTimeout(debounceRef.current);
      }}
    />
  );
}
