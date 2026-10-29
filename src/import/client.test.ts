import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyResult } from "../model";
import { importResult } from "./client";
import type { ImportResponse } from "./protocol";

let workers: StubWorker[];

class StubWorker {
  onmessage: ((event: MessageEvent<ImportResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    workers.push(this);
  }

  respond(response: ImportResponse) {
    this.onmessage!(new MessageEvent("message", { data: response }));
  }

  fail(message: string) {
    this.onerror!({ message } as ErrorEvent);
  }
}

const file = new File(["ZIP content"], "sample.zip");

beforeEach(() => {
  workers = [];
  vi.stubGlobal("Worker", StubWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ZIP import worker client", () => {
  it("returns the parsed result and releases the worker and abort listener", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const importing = importResult(file, controller.signal);
    const worker = workers[0];
    const result = emptyResult(file.name);
    expect(worker.postMessage).toHaveBeenCalledWith({ file });

    worker.respond({ ok: true, result });

    expect(await importing).toBe(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("reports an import failure and terminates the worker", async () => {
    const importing = importResult(file, new AbortController().signal);
    const worker = workers[0];
    worker.respond({ ok: false, error: "Invalid ZIP archive." });

    await expect(importing).rejects.toThrow("Invalid ZIP archive.");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    { message: "Worker crashed.", expected: "Worker crashed." },
    { message: "", expected: "ZIP importer failed" },
  ])("reports a worker error: $expected", async ({ message, expected }) => {
    const importing = importResult(file, new AbortController().signal);
    const worker = workers[0];
    worker.fail(message);

    await expect(importing).rejects.toThrow(expected);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects a pending import on disposal and removes its handlers", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const importing = importResult(file, controller.signal);
    const worker = workers[0];
    const reason = new DOMException("Viewer disposed.", "AbortError");
    controller.abort(reason);

    await expect(importing).rejects.toBe(reason);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not start a worker for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(importResult(file, controller.signal)).rejects.toBe(
      controller.signal.reason,
    );
    expect(workers).toEqual([]);
  });

  it("cleans up when posting the request fails", async () => {
    vi.stubGlobal(
      "Worker",
      class extends StubWorker {
        postMessage = vi.fn(() => {
          throw new DOMException("Could not clone the file.", "DataCloneError");
        });
      },
    );
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");

    await expect(importResult(file, controller.signal)).rejects.toThrow(
      "Could not clone the file.",
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
