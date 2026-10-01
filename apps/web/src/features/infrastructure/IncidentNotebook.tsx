import { BookOpenText, Check, Copy, Download, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import type { InfrastructureLab } from "../../content/infrastructure/labs";
import { formatNotebook, notebookDraft, notebookFields, sameNotebook, saveLabNotebook } from "../../domain/infrastructure-notes";
import { useProfileState } from "../../state/profile-state";

export function IncidentNotebook({ lab, rehearsal }: { lab: InfrastructureLab; rehearsal: boolean }) {
  const { state, save, reload: reloadProfile } = useProfileState();
  const [baseline, setBaseline] = useState(state.infraLabNotes?.[lab.id]);
  const [draft, setDraft] = useState(() => notebookDraft(baseline));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = !sameNotebook(draft, notebookDraft(baseline));
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (blocker.state === "blocked" && !dialog.current?.open) dialog.current?.showModal();
    else if (blocker.state !== "blocked") dialog.current?.close();
  }, [blocker.state]);

  async function persist() {
    if (busy.current || rehearsal) return false;
    busy.current = true; setPending(true); setError("");
    try {
      const saved = await save((previous) => saveLabNotebook(previous, lab.id, draft, baseline, new Date().toISOString()));
      setBaseline(saved.state?.infraLabNotes?.[lab.id]);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notes could not be saved. Your draft is retained."); return false; }
    finally { busy.current = false; setPending(false); }
  }
  async function reload() {
    if (dirty || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const latest = await reloadProfile();
      const note = latest.state?.infraLabNotes?.[lab.id];
      setBaseline(note); setDraft(notebookDraft(note));
    } catch { setError("Could not load saved notes. Your current text is retained."); }
    finally { busy.current = false; setPending(false); }
  }
  const exported = formatNotebook(lab.title, draft);
  async function copy() {
    try { await navigator.clipboard.writeText(exported); setCopied(true); }
    catch { setError("Clipboard unavailable. Download the notebook instead."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exported], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `getops-${lab.id}-notes.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filled = notebookFields.filter(({ id }) => draft[id].trim()).length;
  return <>
    <details className="incident-notebook">
      <summary><BookOpenText size={18} /><strong>Incident notebook</strong><span>{pending ? "Saving..." : dirty ? "Unsaved draft" : baseline ? "Saved" : "No notes"} / {filled} of 4 fields</span></summary>
      <div className="incident-notebook-body">
        <p className="investigation-boundary">Personal reasoning, not automatically graded. Synthetic evidence only; no customer names, credentials or confidential production details.</p>
        {rehearsal && <p className="notebook-status">Saved notebook is read-only during rehearsal.</p>}
        <div className="notebook-fields">{notebookFields.map(({ id, title, prompt }) => <label key={id}><span>{title}<small>{draft[id].length} / 1200</small></span><textarea aria-label={title} rows={4} maxLength={1200} placeholder={prompt} value={draft[id]} disabled={pending || rehearsal} onChange={(event) => { setDraft((previous) => ({ ...previous, [id]: event.target.value })); setCopied(false); }} /></label>)}</div>
        {error && <p role="alert" className="infra-save-error">{error}</p>}
        <footer className="notebook-actions"><button type="button" className="button-primary" disabled={!dirty || pending || rehearsal} onClick={() => void persist()}><Save size={16} />{pending ? "Saving notes..." : "Save notes"}</button>
          <button type="button" className="icon-button" title="Discard unsaved notes" aria-label="Discard unsaved notes" disabled={!dirty || pending} onClick={() => { setDraft(notebookDraft(baseline)); setError(""); setCopied(false); }}><Trash2 size={16} /></button>
          <button type="button" className="icon-button" title="Reload saved notes" aria-label="Reload saved notes" disabled={dirty || pending} onClick={() => void reload()}><RefreshCw size={16} /></button>
          <button type="button" className="icon-button" title={copied ? "Copied notebook" : "Copy notebook"} aria-label={copied ? "Copied notebook" : "Copy notebook"} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
          <button type="button" className="icon-button" title="Download notebook" aria-label="Download notebook" onClick={download}><Download size={16} /></button>
          <span aria-live="polite">{copied ? "Copied" : baseline && !dirty ? `Saved ${new Date(baseline.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        </footer>
      </div>
    </details>
    <dialog ref={dialog} className="notebook-leave-dialog" aria-labelledby="notebook-leave-title" onCancel={(event) => { event.preventDefault(); if (!pending && blocker.state === "blocked") blocker.reset(); }}>
      <h2 id="notebook-leave-title">Keep your incident notes?</h2><p>Your notebook has unsaved changes.</p>{error && <p role="alert">{error}</p>}
      <div><button type="button" disabled={pending} onClick={() => { if (blocker.state === "blocked") blocker.reset(); }}>Keep editing</button><button type="button" disabled={pending} onClick={() => { if (blocker.state === "blocked") blocker.proceed(); }}>Discard and leave</button><button type="button" className="button-primary" disabled={pending || rehearsal} onClick={() => { void persist().then((saved) => { if (saved && blocker.state === "blocked") blocker.proceed(); }); }}><Save size={15} />Save and leave</button></div>
    </dialog>
  </>;
}
