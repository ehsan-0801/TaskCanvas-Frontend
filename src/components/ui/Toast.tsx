"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const kindStyles: Record<ToastKind, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-teal-200 bg-teal-50 text-teal-700",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, kind, message, action }]);
      // Actionable toasts linger a little longer so there's time to click.
      window.setTimeout(() => dismiss(id), action ? 6000 : 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${kindStyles[item.kind]}`}
          >
            <span>{item.message}</span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline underline-offset-2 transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
