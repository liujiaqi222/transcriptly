/**
 * Placeholder manager page (#57).
 *
 * Start in the page-injected selection mode opens
 * `manager.html?task=<id>` in a new tab. Until the full manager UI lands
 * (#58 - progress, ETA, per-video results, Pause / Stop / Retry, batch
 * history), this page only acknowledges the task id so the jump has a
 * valid destination instead of a browser error page.
 */

const taskId = new URLSearchParams(location.search).get("task");
const status = document.querySelector<HTMLElement>(".status");
if (status) {
  status.textContent = taskId
    ? `Batch task ${taskId} is running. Full progress view arrives soon.`
    : "No batch task id in the URL.";
}
