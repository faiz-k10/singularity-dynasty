"use client";

import { useActionState } from "react";
import { addPost, uploadProspects, uploadDraftBoard } from "./actions";

const START = { ok: false, message: "", errors: [] };

function Result({ state }) {
  if (state.ok) return <p className="auth-notice mono" role="status">{state.message}</p>;
  if (!state.errors.length) return null;
  return (
    <div className="auth-error mono" role="alert">
      {state.errors.map((e) => (
        <div key={e}>{e}</div>
      ))}
    </div>
  );
}

export function PostForm() {
  const [state, action, pending] = useActionState(addPost, START);
  return (
    <form action={action} className="adm-form">
      <label className="feed-label mono" htmlFor="post-title">TITLE</label>
      <input id="post-title" name="title" required maxLength={200} className="feed-input auth-input" placeholder="Week 9 rankings are live" />
      <label className="feed-label mono" htmlFor="post-url">LINK (OPTIONAL)</label>
      <input id="post-url" name="url" maxLength={500} className="feed-input auth-input" placeholder="https://… or /tools/redraft-rankings" />
      <button className="btn-primary" disabled={pending}>{pending ? "Posting…" : "Post Drop"}</button>
      <Result state={state} />
    </form>
  );
}

const thisYear = new Date().getFullYear();

export function ProspectUpload() {
  const [state, action, pending] = useActionState(uploadProspects, START);
  return (
    <form action={action} className="adm-form">
      <p className="adm-help">Columns: <code>rank, player_name, position</code> (WR or QB), optional <code>school, comp, notes</code>. Replaces that class&apos;s whole board.</p>
      <label className="feed-label mono" htmlFor="pr-class">DRAFT CLASS</label>
      <input id="pr-class" name="draft_class" type="number" defaultValue={thisYear + 1} min={2020} max={2100} required className="feed-input auth-input" />
      <label className="feed-label mono" htmlFor="pr-file">CSV FILE</label>
      <input id="pr-file" name="file" type="file" accept=".csv,text/csv" required className="adm-file" />
      <button className="btn-primary" disabled={pending}>{pending ? "Publishing…" : "Publish Prospect Board"}</button>
      <Result state={state} />
    </form>
  );
}

export function DraftBoardUpload() {
  const [state, action, pending] = useActionState(uploadDraftBoard, START);
  return (
    <form action={action} className="adm-form">
      <p className="adm-help">Columns: <code>round, pick, player_name, position</code>, optional <code>team, is_stack, stack_note</code>. Replaces that season&apos;s Startup or Rookie board.</p>
      <div className="adm-row">
        <div>
          <label className="feed-label mono" htmlFor="db-season">SEASON</label>
          <input id="db-season" name="season" type="number" defaultValue={thisYear} min={2020} max={2100} required className="feed-input auth-input" />
        </div>
        <div>
          <label className="feed-label mono" htmlFor="db-type">BOARD</label>
          <select id="db-type" name="board_type" className="my-filter-select auth-input" defaultValue="startup">
            <option value="startup">Startup</option>
            <option value="rookie">Rookie</option>
          </select>
        </div>
      </div>
      <label className="feed-label mono" htmlFor="db-file">CSV FILE</label>
      <input id="db-file" name="file" type="file" accept=".csv,text/csv" required className="adm-file" />
      <button className="btn-primary" disabled={pending}>{pending ? "Publishing…" : "Publish Draft Board"}</button>
      <Result state={state} />
    </form>
  );
}
