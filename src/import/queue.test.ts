import { describe, expect, it, vi } from "vitest";
import { ImportQueue } from "./queue";

const file = (name: string) => new File([name], name);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("ZIP import queue", () => {
  it("finishes each import before starting the next, in drop order", async () => {
    const firstStarted = deferred();
    const firstFinished = deferred();
    const secondStarted = deferred();
    const secondFinished = deferred();
    const importFile = vi.fn(async (input: File) => {
      if (input.name === "first.zip") {
        firstStarted.resolve();
        await firstFinished.promise;
      } else {
        secondStarted.resolve();
        await secondFinished.promise;
      }
    });
    const progress = vi.fn();
    const queue = new ImportQueue(importFile, progress);
    const files = [file("first.zip"), file("second.zip")];
    const completed = queue.enqueue(files);

    await firstStarted.promise;
    expect(importFile.mock.calls.map(([input]) => input.name)).toEqual([
      "first.zip",
    ]);
    firstFinished.resolve();
    await secondStarted.promise;
    expect(importFile.mock.calls.map(([input]) => input.name)).toEqual([
      "first.zip",
      "second.zip",
    ]);
    secondFinished.resolve();
    expect(await completed).toEqual({
      loaded: ["first.zip", "second.zip"],
      failures: [],
    });
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { file: files[0], index: 1, total: 2 },
      { file: files[1], index: 2, total: 2 },
    ]);
  });

  it("appends another drop without interrupting the current import", async () => {
    const started = deferred();
    const finish = deferred();
    const importFile = vi.fn(async (input: File) => {
      if (input.name === "first.zip") {
        started.resolve();
        await finish.promise;
      }
    });
    const progress = vi.fn();
    const queue = new ImportQueue(importFile, progress);
    const completed = queue.enqueue([file("first.zip"), file("second.zip")]);
    await started.promise;
    expect(queue.enqueue([file("third.zip")])).toBe(completed);
    expect(importFile).toHaveBeenCalledTimes(1);
    finish.resolve();

    expect(await completed).toEqual({
      loaded: ["first.zip", "second.zip", "third.zip"],
      failures: [],
    });
    expect(progress.mock.calls.map(([{ index, total }]) => [index, total])).toEqual(
      [[1, 2], [2, 3], [3, 3]],
    );
  });

  it("reports each failed or unsupported file and continues with valid ZIPs", async () => {
    const importFile = vi.fn(async (input: File) => {
      if (input.name === "broken.zip") throw Error("Invalid archive.");
    });
    const queue = new ImportQueue(importFile, vi.fn());
    const summary = await queue.enqueue([
      file("notes.txt"),
      file("first.zip"),
      file("broken.zip"),
      file("last.ZIP"),
    ]);

    expect(importFile.mock.calls.map(([input]) => input.name)).toEqual([
      "first.zip",
      "broken.zip",
      "last.ZIP",
    ]);
    expect(summary).toEqual({
      loaded: ["first.zip", "last.ZIP"],
      failures: [
        { name: "notes.txt", message: "Choose a Wakhan ZIP file." },
        { name: "broken.zip", message: "Invalid archive." },
      ],
    });
  });

  it("starts a fresh batch after a failure without retaining progress or errors", async () => {
    const progress = vi.fn();
    const queue = new ImportQueue(async () => {}, progress);
    await queue.enqueue([file("notes.txt")]);
    const next = file("next.zip");
    expect(await queue.enqueue([next])).toEqual({
      loaded: ["next.zip"],
      failures: [],
    });
    expect(progress).toHaveBeenLastCalledWith({ file: next, index: 1, total: 1 });
  });

  it("does nothing when the file picker is cancelled", async () => {
    const importFile = vi.fn();
    const progress = vi.fn();
    const queue = new ImportQueue(importFile, progress);
    expect(await queue.enqueue([])).toEqual({ loaded: [], failures: [] });
    expect(importFile).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });
});
