import { extractArchive } from "./archive";
import { parseMembers } from "./parse";

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  try {
    const file = event.data.file;
    if (file.size > 250_000_000)
      throw Error("ZIP exceeds the 250 MB import limit.");
    const members = extractArchive(new Uint8Array(await file.arrayBuffer()));
    const result = await parseMembers(file.name, members);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
