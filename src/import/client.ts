import type { WakhanResult } from "../model";
import type { ImportRequest, ImportResponse } from "./protocol";

/** Runs one import worker and releases it when the request finishes or is aborted. */
export async function importResult(
  file: File,
  signal: AbortSignal,
): Promise<WakhanResult> {
  signal.throwIfAborted();
  const worker = new Worker(new URL("./importWorker.ts", import.meta.url), {
    type: "module",
  });
  let onAbort!: () => void;

  try {
    return await new Promise<WakhanResult>((resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<ImportResponse>) => {
        const response = event.data;
        if (response.ok) resolve(response.result);
        else reject(Error(response.error));
      };
      worker.onerror = (event) =>
        reject(Error(event.message || "ZIP importer failed"));
      worker.postMessage({ file } satisfies ImportRequest);
    });
  } finally {
    signal.removeEventListener("abort", onAbort);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
