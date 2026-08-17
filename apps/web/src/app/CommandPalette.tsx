import { ArrowRight, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { searchWorkspaceCommands, type WorkspaceCommand } from "./command-search";

const kindLabels: Record<WorkspaceCommand["kind"], string> = {
  destination: "Destination",
  guide: "Guide",
  recall: "Recall card",
  scenario: "Scenario",
};

export function CommandPalette() {
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchWorkspaceCommands(query), [query]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (returnFocus) globalThis.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const openPalette = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (open && event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    globalThis.addEventListener("keydown", openPalette);
    return () => globalThis.removeEventListener("keydown", openPalette);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    globalThis.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  function choose(command: WorkspaceCommand) {
    close(false);
    navigate(command.to);
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  function dismissFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) close();
  }

  function containFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="command-trigger"
        aria-label="Search the workspace"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search size={16} />
        <span>Jump to anything</span>
      </button>

      {open ? createPortal(
        <div className="command-backdrop" onMouseDown={dismissFromBackdrop}>
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search the workspace"
            onKeyDown={containFocus}
          >
            <header>
              <Search size={19} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 120))}
                onKeyDown={handleKeys}
                placeholder="Search guides, recall cards, and scenarios..."
                aria-label="Search guides, recall cards, and scenarios"
                aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Close search"
                title="Close"
                onClick={() => close()}
              >
                <X size={18} />
              </button>
            </header>

            <div className="command-results" role="listbox">
              {results.length ? results.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    id={`command-${command.id}`}
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex ? "true" : "false"}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(command)}
                    style={{ "--command-color": command.color ?? "var(--blue)" } as CSSProperties}
                  >
                    <span className="command-result-icon"><Icon size={18} /></span>
                    <span>
                      <strong>{command.label}</strong>
                      <small>{kindLabels[command.kind]} · {command.meta}</small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                );
              }) : (
                <div className="command-empty">
                  <strong>No matching operation</strong>
                  <span>Try a branch, failure mode, market-data concept, or scenario title.</span>
                </div>
              )}
            </div>

            <footer>
              <span>150 recall cards</span>
              <span>9 deep dives</span>
              <span>6 pressure scenarios</span>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
