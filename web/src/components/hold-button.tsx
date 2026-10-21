"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";

const HOLD_MS = 900;

type State = "idle" | "holding" | "hint" | "pending" | "running";

/**
 * Basılı tutarak onaylanan düğme (confirm() penceresi yerine). Erken bırakılırsa dolum geri sarılır ve
 * "Basılı tutun" yazar. Dolunca işlem hemen yapılmaz: düğme birkaç saniye "Geri al" olur, süre bitince
 * onConfirm çalışır. Bu sırada bileşen kalkarsa (başka sekmeye geçildi) işlem yapılır; sayfa kapatılırken uyarır.
 */
export function HoldButton({
  children,
  pending,
  onConfirm,
  undoSeconds = 4,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  /** Geri al süresince ve işlem sürerken görünen yazı, örn. "İptal ediliyor" */
  pending: string;
  onConfirm: () => unknown;
  undoSeconds?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [left, setLeft] = useState(undoSeconds);
  const holdTimer = useRef<number | undefined>(undefined);
  const confirmRef = useRef(onConfirm);
  const pendingRef = useRef(false);

  useEffect(() => {
    confirmRef.current = onConfirm;
  });

  // Geri al süresi bitmeden bileşen kalkarsa işlem yine yapılır.
  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      if (pendingRef.current) {
        pendingRef.current = false;
        confirmRef.current();
      }
    },
    [],
  );

  useEffect(() => {
    if (state === "hint") {
      const timer = window.setTimeout(() => setState("idle"), 1500);
      return () => window.clearTimeout(timer);
    }
    if (state !== "pending") return;
    pendingRef.current = true;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const rest = undoSeconds - Math.floor((Date.now() - started) / 1000);
      if (rest > 0) return setLeft(rest);
      window.clearInterval(timer);
      pendingRef.current = false;
      setState("running");
      Promise.resolve(confirmRef.current()).finally(() => setState("idle"));
    }, 200);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => {
      window.clearInterval(timer);
      removeEventListener("beforeunload", warn);
    };
  }, [state, undoSeconds]);

  function start() {
    if (disabled || (state !== "idle" && state !== "hint")) return;
    setState("holding");
    holdTimer.current = window.setTimeout(() => {
      setLeft(undoSeconds);
      setState("pending");
    }, HOLD_MS);
  }

  function stop() {
    if (state !== "holding") return;
    window.clearTimeout(holdTimer.current);
    setState("hint");
  }

  function undo() {
    pendingRef.current = false;
    setState("idle");
  }

  const holding = state === "holding";
  const isKey = (e: React.KeyboardEvent) => e.key === " " || e.key === "Enter";

  return (
    <button
      type="button"
      disabled={disabled || state === "running"}
      title={state === "pending" ? "Vazgeçmek için tıklayın" : "Onaylamak için basılı tutun"}
      onPointerDown={(e) => e.button === 0 && start()}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (!isKey(e) || state === "pending") return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => isKey(e) && stop()}
      onBlur={stop}
      onClick={state === "pending" ? undo : undefined}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative select-none overflow-hidden [-webkit-touch-callout:none] ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-current opacity-15"
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: holding ? `transform ${HOLD_MS}ms linear` : "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      {state === "pending" && (
        <span aria-hidden className="hold-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current" style={{ animationDuration: `${undoSeconds}s` }} />
      )}
      <span className="relative inline-flex items-center gap-2" aria-live="polite">
        {state === "pending" ? (
          <>
            <span className="opacity-70">{pending}</span>
            <Undo2 className="size-4" /> Geri al <span className="tabular-nums">{left}</span>
          </>
        ) : state === "running" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {pending}
          </>
        ) : state === "hint" ? (
          "Basılı tutun"
        ) : (
          children
        )}
      </span>
    </button>
  );
}
