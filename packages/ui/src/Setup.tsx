import { Icon } from "./icons";
import { cx } from "./util";

export type SetupItem = { id: string; label: string; done: boolean; cta?: string };
export type SetupProps = { items: SetupItem[]; onAction: (id: string) => void; onDismiss: () => void };

/** The "finish setting up" card on the Active tab. Hides itself when everything is done. */
export function SetupCard({ items, onAction, onDismiss }: SetupProps) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <div className={cx("setup")} data-demo="setup">
      <div className={cx("setup-h")}>
        <b>Finish setting up</b>
        <span>{done} of {items.length}</span>
        <button onClick={onDismiss}>Hide</button>
      </div>
      <div className={cx("setup-bar")}><i style={{ width: `${(done / items.length) * 100}%` }} /></div>
      {items.map((i) => (
        <div key={i.id} className={cx("setup-i", i.done && "dn")}>
          <span className={cx("sck")}>{i.done && <Icon name="check" size={10} sw={3.5} color="#fff" />}</span>
          <span>{i.label}</span>
          {!i.done && i.cta && <button className={cx("btn")} onClick={() => onAction(i.id)}>{i.cta}</button>}
        </div>
      ))}
    </div>
  );
}
