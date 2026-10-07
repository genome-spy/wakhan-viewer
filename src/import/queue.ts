export interface ImportProgress {
  file: File;
  index: number;
  total: number;
}

export interface ImportSummary {
  loaded: string[];
  failures: { name: string; message: string }[];
}

/** Import one archive at a time, including files added while a batch is running. */
export class ImportQueue {
  private files: File[] = [];
  private total = 0;
  private running?: Promise<ImportSummary>;

  constructor(
    private importFile: (file: File) => Promise<void>,
    private onProgress: (progress: ImportProgress) => void,
  ) {}

  enqueue(files: Iterable<File>): Promise<ImportSummary> {
    const additions = Array.from(files);
    this.files.push(...additions);
    this.total += additions.length;
    this.running ??= Promise.resolve().then(() => this.drain());
    return this.running;
  }

  private async drain(): Promise<ImportSummary> {
    const summary: ImportSummary = { loaded: [], failures: [] };
    let index = 0;
    try {
      while (this.files.length) {
        const file = this.files.shift()!;
        this.onProgress({ file, index: ++index, total: this.total });
        try {
          if (!file.name.toLowerCase().endsWith(".zip"))
            throw Error("Choose a Wakhan ZIP file.");
          await this.importFile(file);
          summary.loaded.push(file.name);
        } catch (error) {
          summary.failures.push({
            name: file.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return summary;
    } finally {
      this.total = 0;
      this.running = undefined;
    }
  }
}
