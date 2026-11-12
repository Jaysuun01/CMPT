// Undo and redo for the date range, shown as one labelled pair.
const ARROW = "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11";

/** One labelled button with its arrow; the shortcut is in the tooltip. */
function HistoryButton({ text, label, shortcut, enabled, redo, onClick }: { text: string; label: string; shortcut: string; enabled: boolean; redo?: boolean; onClick: () => void }) {
  const icon = (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={redo ? "flip" : undefined}>
      <path d={ARROW} />
    </svg>
  );
  return (
    <button type="button" aria-label={label} title={`${label} (${shortcut})`} disabled={!enabled} onClick={onClick}>
      {!redo && icon}
      {text}
      {redo && icon}
    </button>
  );
}

/** Whether each direction has anything to go back to, and what to do. */
export interface HistoryProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** Undo / redo for range changes, as one labelled pair. */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: HistoryProps) {
  return (
    <div className="history" role="group" aria-label="Range history">
      <HistoryButton text="Undo" label="Undo range change" shortcut="Ctrl+Z" enabled={canUndo} onClick={onUndo} />
      <HistoryButton text="Redo" label="Redo range change" shortcut="Ctrl+Shift+Z" enabled={canRedo} redo onClick={onRedo} />
    </div>
  );
}
