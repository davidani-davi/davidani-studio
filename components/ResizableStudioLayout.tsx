"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

type DragSide = "left" | "right";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function ResizableStudioLayout({ left, center, right }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(312);
  const [rightWidth, setRightWidth] = useState(430);
  const dragRef = useRef<{
    side: DragSide;
    startX: number;
    leftWidth: number;
    rightWidth: number;
    rootWidth: number;
  } | null>(null);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const delta = event.clientX - drag.startX;
      const centerMin = 520;

      if (drag.side === "left") {
        const maxLeft = Math.max(260, drag.rootWidth - drag.rightWidth - centerMin);
        setLeftWidth(clamp(drag.leftWidth + delta, 260, Math.min(600, maxLeft)));
      } else {
        const maxRight = Math.max(340, drag.rootWidth - drag.leftWidth - centerMin);
        setRightWidth(clamp(drag.rightWidth - delta, 340, Math.min(820, maxRight)));
      }
    }

    function handleUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function beginDrag(side: DragSide, event: React.PointerEvent<HTMLButtonElement>) {
    const rootWidth = rootRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    dragRef.current = {
      side,
      startX: event.clientX,
      leftWidth,
      rightWidth,
      rootWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  const dividerClass = "studio-resizer hidden lg:flex";

  return (
    <div
      ref={rootRef}
      className="studio-workspace flex min-h-0 flex-1 flex-col lg:grid"
      style={{
        gridTemplateColumns: `${leftWidth}px 10px minmax(520px, 1fr) 10px ${rightWidth}px`,
      }}
    >
      <div className="min-h-0 min-w-0">{left}</div>
      <button
        type="button"
        aria-label="Resize garment and brief columns"
        onPointerDown={(event) => beginDrag("left", event)}
        className={dividerClass}
      >
        <span className="studio-resizer__handle" />
      </button>
      <div className="min-h-0 min-w-0">{center}</div>
      <button
        type="button"
        aria-label="Resize brief and results columns"
        onPointerDown={(event) => beginDrag("right", event)}
        className={dividerClass}
      >
        <span className="studio-resizer__handle" />
      </button>
      <div className="min-h-0 min-w-0">{right}</div>
    </div>
  );
}
