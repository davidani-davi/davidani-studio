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
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(384);
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
      const centerMin = 420;

      if (drag.side === "left") {
        const maxLeft = Math.max(240, drag.rootWidth - drag.rightWidth - centerMin);
        setLeftWidth(clamp(drag.leftWidth + delta, 240, Math.min(560, maxLeft)));
      } else {
        const maxRight = Math.max(300, drag.rootWidth - drag.leftWidth - centerMin);
        setRightWidth(clamp(drag.rightWidth - delta, 300, Math.min(760, maxRight)));
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

  const dividerClass =
    "hidden cursor-col-resize border-x border-neutral-200 bg-neutral-50 transition hover:bg-neutral-100 lg:flex lg:items-center lg:justify-center";

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col lg:grid"
      style={{
        gridTemplateColumns: `${leftWidth}px 8px minmax(420px, 1fr) 8px ${rightWidth}px`,
      }}
    >
      <div className="min-h-0 min-w-0">{left}</div>
      <button
        type="button"
        aria-label="Resize garment and brief columns"
        onPointerDown={(event) => beginDrag("left", event)}
        className={dividerClass}
      >
        <span className="h-10 w-0.5 rounded-full bg-neutral-300" />
      </button>
      <div className="min-h-0 min-w-0">{center}</div>
      <button
        type="button"
        aria-label="Resize brief and results columns"
        onPointerDown={(event) => beginDrag("right", event)}
        className={dividerClass}
      >
        <span className="h-10 w-0.5 rounded-full bg-neutral-300" />
      </button>
      <div className="min-h-0 min-w-0">{right}</div>
    </div>
  );
}
