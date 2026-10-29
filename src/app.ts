import { LitElement, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { live } from "lit/directives/live.js";
import type { Profile, WakhanResult } from "./model";
import { genes, cytobands } from "./annotations";
import { WakhanView } from "./visualization/controller";
import {
  estimateCalibration,
  calibratedCoverage,
  type CalibrationEstimate,
} from "./calibration";
import { ImportQueue } from "./import/queue";
import type { NavigationHelp } from "./navigationHelp";
import "./navigationHelp";
import { renderResultDetails } from "./resultDetails";
import { renderProjectLinks } from "./projectLinks";
import "./locationSearch";

@customElement("wakhan-viewer")
export class WakhanViewer extends LitElement {
  @state() private loaded: WakhanResult[] = [];
  @state() private active = -1;
  @state() private profile: Profile = "integer";
  @state() private importing = false;
  @state() private loadingExample = false;
  @state() private switching = false;
  @state() private dragging = false;
  @state() private message = "";
  @state() private exportBusy = false;
  @state() private calibrationEstimate?: CalibrationEstimate;
  @query("wakhan-navigation-help") private navigationHelp!: NavigationHelp;
  private view?: WakhanView;
  private worker?: Worker;
  private fileInput?: HTMLInputElement;
  private statusTimer?: number;
  private importQueue = new ImportQueue(
    (file) => this.importFile(file),
    ({ file, index, total }) =>
      this.status(`Reading ${file.name} (${index} of ${total})…`, true),
  );

  private get busy() {
    return this.importing || this.loadingExample || this.switching;
  }

  protected createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    this.worker?.terminate();
    this.view?.dispose();
    clearTimeout(this.statusTimer);
    super.disconnectedCallback();
  }

  private status(text: string, sticky = false) {
    clearTimeout(this.statusTimer);
    this.message = text;
    if (!sticky)
      this.statusTimer = window.setTimeout(() => {
        if (this.message === text) this.message = "";
      }, 5000);
  }

  private labelFor(index: number) {
    const name = this.loaded[index]?.name ?? "";
    return this.loaded.filter((r) => r.name === name).length > 1
      ? `${name} (file ${index + 1})`
      : name;
  }

  private openPicker() {
    if (!this.fileInput)
      this.fileInput = this.querySelector("input[type=file]") ?? undefined;
    this.fileInput?.click();
  }

  private async loadExample() {
    if (this.busy) return;
    this.loadingExample = true;
    this.status("Loading HCC1937 example…", true);
    try {
      const name = "HCC1937_plots_data.zip";
      const response = await fetch(
        `${import.meta.env.BASE_URL}examples/${name}`,
      );
      if (!response.ok) throw Error(`Download failed (${response.status}).`);
      const file = new File([await response.blob()], name, {
        type: "application/zip",
      });
      await this.open([file]);
    } catch (error) {
      this.status(
        `Could not load the example: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      this.loadingExample = false;
    }
  }

  private async open(files: File[]) {
    if (!files.length) return;
    const completed = this.importQueue.enqueue(files);
    if (this.importing) return;
    this.importing = true;
    try {
      const { loaded, failures } = await completed;
      const ready =
        loaded.length === 1
          ? `${loaded[0]} ready.`
          : loaded.length
            ? `Loaded ${loaded.length} ZIP files.`
            : "No ZIP files loaded.";
      const failed = failures
        .map(({ name, message }) => `${name}: ${message}`)
        .join("; ");
      this.status(
        failures.length ? `${ready} Failed — ${failed}` : ready,
        failures.length > 0,
      );
    } finally {
      this.importing = false;
    }
  }

  private async importFile(file: File) {
    const worker = new Worker(
      new URL("./import/importWorker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker = worker;
    try {
      const result = await new Promise<WakhanResult>((resolve, reject) => {
        worker.onmessage = (
          event: MessageEvent<{
            ok: boolean;
            result?: WakhanResult;
            error?: string;
          }>,
        ) => {
          event.data.ok && event.data.result
            ? resolve(event.data.result)
            : reject(Error(event.data.error ?? "ZIP import failed"));
        };
        worker.onerror = (event) =>
          reject(Error(event.message || "ZIP importer failed"));
        worker.postMessage({ file });
      });
      this.loaded = [...this.loaded, result];
      if (this.active < 0) {
        try {
          await this.showResult(this.loaded.length - 1);
        } catch (error) {
          this.loaded = this.loaded.slice(0, -1);
          throw error;
        }
      }
    } finally {
      worker.terminate();
      if (this.worker === worker) this.worker = undefined;
    }
  }

  private async activate(index: number) {
    if (this.busy || !this.loaded[index]) return;
    this.status(`Opening ${this.loaded[index].name}…`, true);
    try {
      await this.showResult(index);
      this.status(`${this.loaded[index].name} ready`);
    } catch (error) {
      this.status(`Visualization failed: ${String(error)}`, true);
    }
  }

  private async showResult(index: number) {
    const result = this.loaded[index];
    const profile = result.profiles.includes(this.profile)
      ? this.profile
      : result.profiles[0];
    const calibration = result.coverage.length
      ? estimateCalibration(result)
      : undefined;
    this.switching = true;
    try {
      await this.updateComplete;
      if (!this.view) {
        const host = this.querySelector<HTMLElement>("#vis");
        if (!host) throw Error("Visualization container was not created.");
        this.view = new WakhanView(host, genes, cytobands);
      }
      await this.view.show(
        result,
        profile,
        calibration,
        calibration ? calibratedCoverage(result.coverage, calibration) : [],
      );
      this.active = index;
      this.profile = profile;
      this.calibrationEstimate = calibration;

      void this.navigationHelp.showOnce();
    } catch (error) {
      if (this.active < 0) {
        this.view?.dispose();
        this.view = undefined;
      }
      throw error;
    } finally {
      this.switching = false;
    }
  }

  private async changeProfile(value: Profile) {
    const result = this.loaded[this.active];
    if (this.busy || !result?.profiles.includes(value) || !this.view) return;
    this.switching = true;
    try {
      await this.view.show(
        result,
        value,
        this.calibrationEstimate,
        this.calibratedRows(result),
      );
      this.profile = value;
    } catch (error) {
      this.status(`Visualization failed: ${String(error)}`, true);
    } finally {
      this.switching = false;
    }
  }

  private calibratedRows(result: WakhanResult) {
    return this.calibrationEstimate
      ? calibratedCoverage(result.coverage, this.calibrationEstimate)
      : [];
  }

  private async exportImage(format: "png" | "svg") {
    if (!this.view || this.active < 0) return;
    this.exportBusy = true;
    try {
      const result = await this.view.export(format);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${this.loaded[this.active].name.replace(/\.zip$/i, "")}-${this.active + 1}-${this.profile}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.status(
        "warnings" in result &&
          Array.isArray(result.warnings) &&
          result.warnings.length
          ? result.warnings.join(" ")
          : `${format.toUpperCase()} exported`,
      );
    } catch (error) {
      this.status(`Export failed: ${String(error)}`, true);
    } finally {
      this.exportBusy = false;
    }
  }

  private onDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.dragging = true;
  }
  private onDrop(event: DragEvent) {
    this.dragging = false;
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void this.open(Array.from(event.dataTransfer.files));
  }

  private renderToolbar(active: WakhanResult) {
    return html`<section class="toolbar" aria-label="Explore results">
      <button class="primary" @click=${this.openPicker} ?disabled=${this.busy}>
        Open ZIPs
      </button>
      <div class="control result-control">
        <label class="sr-only" for="result-select">Result</label>
        <select
          id="result-select"
          .value=${live(String(this.active))}
          ?disabled=${this.busy}
          @change=${(e: Event) =>
            this.activate(Number((e.target as HTMLSelectElement).value))}
        >
          ${this.loaded.map(
            (_r, i) =>
              html`<option value=${i} ?selected=${i === this.active}>
                ${this.labelFor(i)}
              </option>`,
          )}
        </select>
      </div>
      <div class="control">
        <label class="sr-only" for="profile-select">Profile</label>
        <select
          id="profile-select"
          .value=${live(this.profile)}
          ?disabled=${this.busy}
          @change=${(e: Event) =>
            this.changeProfile(
              (e.target as HTMLSelectElement).value as Profile,
            )}
        >
          ${active.profiles.map(
            (p) =>
              html`<option value=${p} ?selected=${p === this.profile}>
                ${p === "integer" ? "Integer CN" : "Subclonal CN"}
              </option>`,
          )}
        </select>
      </div>
      <wakhan-location-search
        .search=${this.view?.search}
        .disabled=${this.busy}
      ></wakhan-location-search>
      <div class="exports" role="group" aria-label="Export image">
        <button
          ?disabled=${this.exportBusy || this.busy}
          @click=${() => this.exportImage("png")}
        >
          PNG ↓
        </button>
        <button
          ?disabled=${this.exportBusy || this.busy}
          @click=${() => this.exportImage("svg")}
        >
          SVG ↓
        </button>
      </div>
      <button @click=${() => this.navigationHelp.show()}>Help</button>
      ${renderResultDetails(active, this.profile, this.calibrationEstimate)}
    </section>`;
  }

  render() {
    const active = this.loaded[this.active];
    const viewing = !!active || this.switching;
    return html`<div
      class="app ${viewing ? "is-viewing" : ""} ${
        this.dragging ? "dragging" : ""
      }"
      @dragover=${this.onDragOver}
      @dragleave=${() => (this.dragging = false)}
      @drop=${this.onDrop}
      @pointerdown=${(e: PointerEvent) => {
        const details = this.querySelector<HTMLDetailsElement>(".details");
        if (details && !details.contains(e.target as Node))
          details.open = false;
      }}
    >
      <input
        class="sr-only"
        type="file"
        accept=".zip,application/zip"
        multiple
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          void this.open(Array.from(input.files ?? []));
          input.value = "";
        }}
      />
      <header class="masthead">
        <div class="brand">
          <h1>Wakhan <em>Viewer</em></h1>
        </div>
        ${
          active
            ? this.renderToolbar(active)
            : html`<div class="top-actions">
                <a
                  href="https://genomespy.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="powered"
                >
                  Powered by <strong>GenomeSpy ↗</strong>
                </a>
              </div>`
        }
      </header>
      ${
        viewing
          ? html`<main class="workspace" aria-label="Genome viewer">
              <div
                id="vis"
                class=${this.busy ? "is-loading" : ""}
                aria-label="Interactive genomic tracks"
              ></div>
            </main>`
          : html`<main class="welcome">
              <div class="welcome-copy">
                <h2>Open Wakhan results</h2>
                <p>
                  <a
                    href="https://github.com/KolmogorovLab/Wakhan"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Wakhan</a
                  >
                  analyzes long-read tumor sequencing data to estimate
                  copy-number changes, including haplotype-specific profiles
                  when phasing is available.
                </p>
                <p>
                  This viewer opens a Wakhan results ZIP and displays its
                  copy-number, read-depth, BAF, and structural-variant tracks.
                </p>
                <p>
                  <strong>Work in progress.</strong> The interface and support
                  for Wakhan ZIP formats are still evolving.
                </p>
                <div class="welcome-actions">
                  <button
                    class="primary large"
                    @click=${this.openPicker}
                    ?disabled=${this.busy}
                  >
                    Open ZIP files
                  </button>
                  <button
                    class="large"
                    @click=${this.loadExample}
                    ?disabled=${this.busy}
                  >
                    ${
                      this.loadingExample
                        ? "Loading example…"
                        : "Load HCC1937 example"
                    }
                  </button>
                </div>
                <p class="hint">
                  Or drop one or more ZIP files anywhere on this page. Files are
                  processed in your browser.
                </p>
              </div>
            </main>`
      }
      ${
        active
          ? nothing
          : html`<footer class="footer">
              <span class="footer-project">${renderProjectLinks()}</span>
              <span>
                A viewer for
                <a href="https://github.com/KolmogorovLab/Wakhan">Wakhan</a>
                results, powered by
                <a href="https://genomespy.app/">GenomeSpy</a>.
              </span>
            </footer>`
      }
      ${
        this.dragging
          ? html`<div class="drop-overlay">
              Drop Wakhan ZIP files to open them
            </div>`
          : nothing
      }
      <wakhan-navigation-help></wakhan-navigation-help>
      <div
        class="status ${this.message || this.busy ? "is-visible" : ""}"
        role="status"
        aria-live="polite"
      >
        ${this.message}${this.busy ? " Working…" : ""}
      </div>
    </div>`;
  }
}
