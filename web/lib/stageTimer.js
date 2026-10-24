// Stage timings for a server render, written to the runtime logs as one "[page]" line (read with `vercel logs`), so a slow
// page can be traced to the step that is slow. `time(name, promise)` passes the promise's value through unchanged.
export function stageTimer(label) {
  const t0 = Date.now();
  const marks = [];
  return {
    time(name, promise) {
      const s = Date.now();
      return Promise.resolve(promise).then((v) => {
        marks.push(`${name}=${Date.now() - s}`);
        return v;
      });
    },
    // Same for a plain synchronous step.
    run(name, fn) {
      const s = Date.now();
      const v = fn();
      marks.push(`${name}=${Date.now() - s}`);
      return v;
    },
    done() {
      console.log(`[page] ${label} total=${Date.now() - t0}ms ${marks.join(" ")}`);
    },
  };
}
