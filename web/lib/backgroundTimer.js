// A repeating timer that keeps its rhythm when the browser tab is hidden or covered by another window. Plain setInterval /
// setTimeout on the page are throttled hard in a background tab (Chrome slows them to about once a minute after a few
// minutes hidden), which froze My Team's live scores on a second monitor. A Web Worker's timer is not throttled that way,
// so the worker keeps time and tells the page when to run `fn`; the page does the work (a server action, which is a plain
// network request and is not throttled). Falls back to an ordinary timeout chain where workers are unavailable.
//
//   const stop = startBackgroundTimer(async () => { ... }, () => 15000);
//
// fn runs one at a time (the next wait starts after it finishes); getMs() is read before every wait, so the cadence can change.
export function startBackgroundTimer(fn, getMs) {
  let stopped = false;
  let worker = null;
  let fallback = null;

  const runThenWait = async () => {
    try {
      await fn();
    } catch {
      // a failed tick just waits for the next one
    }
    if (!stopped) wait();
  };
  const wait = () => {
    const ms = getMs();
    if (worker) worker.postMessage(ms);
    else fallback = setTimeout(runThenWait, ms);
  };

  try {
    const url = URL.createObjectURL(new Blob(["onmessage=function(e){setTimeout(function(){postMessage(0)},e.data)}"], { type: "text/javascript" }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => {
      if (!stopped) runThenWait();
    };
    worker.onerror = () => {
      // the worker could not start (a strict content policy, say): use plain timers instead
      worker?.terminate();
      worker = null;
      if (!stopped) wait();
    };
  } catch {
    worker = null;
  }
  wait();

  return () => {
    stopped = true;
    if (fallback) clearTimeout(fallback);
    if (worker) worker.terminate();
  };
}
