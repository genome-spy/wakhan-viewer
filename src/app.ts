import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Profile, WakhanResult } from "./model";
import { genes, cytobands } from "./annotations";
import { WakhanView } from "./visualization/controller";
import zipReportUrl from "../docs/wakhan-zip-format.md?url";
import {
  estimateCalibration,
  calibratedCoverage,
  type CalibrationEstimate,
} from "./calibration";
import { layoutSignature } from "./visualization/spec";
import { ImportQueue } from "./import/queue";

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
  private view?: WakhanView;
  private viewLayout?: string;
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
      ? `${name} · file ${index + 1}`
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
      const response = await fetch(`${import.meta.env.BASE_URL}examples/${name}`);
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
          this.view?.dispose();
          this.view = undefined;
          this.loaded = this.loaded.slice(0, -1);
          this.active = -1;
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
    const prior = this.view?.domain();
    this.active = index;
    this.profile = result.profiles.includes(this.profile)
      ? this.profile
      : result.profiles[0];
    this.calibrationEstimate = result.coverage.length
      ? estimateCalibration(result)
      : undefined;
    this.switching = true;
    try {
      await this.updateComplete;
      const layout = layoutSignature(result, this.calibrationEstimate);
      if (this.view && this.viewLayout !== layout) {
        this.view.dispose();
        this.view = undefined;
      }
      if (!this.view) {
        const host = this.querySelector<HTMLElement>("#vis");
        if (!host) throw Error("Visualization container was not created.");
        const view = new WakhanView(host);
        try {
          await view.initialize(
            genes,
            cytobands,
            result,
            this.calibrationEstimate,
          );
        } catch (error) {
          view.dispose();
          throw error;
        }
        this.view = view;
        this.viewLayout = layout;
      }
      this.view.show(result, this.profile, !!prior, this.calibratedRows(result));
      if (prior) this.view.zoom(prior, 0);
    } finally {
      this.switching = false;
    }
  }

  private changeProfile(value: Profile) {
    const result = this.loaded[this.active];
    if (!result?.profiles.includes(value) || !this.view) return;
    this.profile = value;
    this.view.show(result, value, true, this.calibratedRows(result));
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

  private renderProjectLinks() {
    return html`
      <a
        href="https://github.com/genome-spy/wakhan-viewer"
        target="_blank"
        rel="noopener noreferrer"
      >GitHub</a> ·
      <a
        href="https://github.com/genome-spy/wakhan-viewer/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
      >MIT license</a>
    `;
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
          ?disabled=${this.busy}
          @change=${(e: Event) => this.activate(Number((e.target as HTMLSelectElement).value))}
        >
          ${this.loaded.map((_r, i) => html`<option value=${i} ?selected=${i === this.active}>${this.labelFor(i)}</option>`)}
        </select>
      </div>
      <div class="control">
        <label class="sr-only" for="profile-select">Profile</label>
        <select
          id="profile-select"
          ?disabled=${this.busy}
          @change=${(e: Event) => this.changeProfile((e.target as HTMLSelectElement).value as Profile)}
        >
          ${active.profiles.map((p) => html`<option value=${p} ?selected=${p === this.profile}>${p === "integer" ? "Integer CN" : "Subclonal CN"}</option>`)}
        </select>
      </div>
      <div class="exports" role="group" aria-label="Export image">
        <button
          ?disabled=${this.exportBusy || this.busy}
          @click=${() => this.exportImage("png")}
        >PNG ↓</button>
        <button
          ?disabled=${this.exportBusy || this.busy}
          @click=${() => this.exportImage("svg")}
        >SVG ↓</button>
      </div>
      <details
        class="details"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Escape") (e.currentTarget as HTMLDetailsElement).open = false;
        }}
      >
        <summary aria-label=${`About these results (${active.diagnostics.length} notes)`}>
          About <span>${active.diagnostics.length}</span>
        </summary>
        <div class="details-panel">
          <h2>${active.name}</h2>
          <p class="details-meta">
            GRCh38 · ${active.segments[this.profile].length / (active.mode === "phased" ? 2 : 1)}
            CN intervals · ${active.mode}
          </p>
          ${active.coverage.length ? html`<div class="calibration-note">
            ${this.calibrationEstimate ? html`
              <strong>Estimated depth calibration</strong>
              <p>
                The ZIP omits Wakhan’s exact calibration and the identity of the
                plotted solution. We infer the copy/depth mapping from rounded
                gene values. Its agreement with Wakhan’s original plot is
                unverified, especially for subclonal profiles. Depth alignment
                and depth-derived copy estimates are approximate.
              </p>
              <p class="calibration-values">
                Depth ≈ ${this.calibrationEstimate.offset.toFixed(3)} +
                ${this.calibrationEstimate.singleCopyDepth.toFixed(3)} × copies
              </p>
            ` : html`
              <strong>Depth calibration unavailable</strong>
              <p>
                The ZIP omits Wakhan’s exact calibration, and a consistent
                estimate is unavailable. Copy number and raw read
                depth are shown in separate tracks.
              </p>
            `}
          </div>` : nothing}
          <p>Scroll to zoom · drag to pan · navigator to brush.</p>
          <p>
            HP1 and HP2 are chromosome-local labels. Wakhan CN confidence is
            distinct from phasing confidence.
          </p>
          <ul>
            ${active.diagnostics.map((d) => html`<li class=${d.level}>${d.message}</li>`)}
          </ul>
          <p>
            ${active.svLinks.length} SV links · ${active.svSites.length} SV sites ·
            ${active.baf.filter((b) => b.baf !== null).length} BAF bins ·
            ${active.lohAvailable ? `${active.loh.length} LOH intervals` : "LOH not supplied"}
            · ${active.rankings.length} ranked solutions (included solution
            unspecified) · VCF sample ${active.vcfSample ?? "not supplied"}.
          </p>
          <a href=${zipReportUrl} target="_blank" rel="noopener noreferrer">Wakhan ZIP format findings ↗</a>
          <p class="credits">
            ${this.renderProjectLinks()}<br />
            Built with <a href="https://genomespy.app/">GenomeSpy</a> ·
            <a href="https://github.com/KolmogorovLab/Wakhan">Wakhan</a>
          </p>
        </div>
      </details>
    </section>`;
  }

  render() {
    const active = this.loaded[this.active];
    return html`<div
      class="app ${active ? "is-viewing" : ""} ${this.dragging ? "dragging" : ""}"
      @dragover=${this.onDragOver}
      @dragleave=${() => (this.dragging = false)}
      @drop=${this.onDrop}
      @pointerdown=${(e: PointerEvent) => {
        const details = this.querySelector<HTMLDetailsElement>(".details");
        if (details && !details.contains(e.target as Node)) details.open = false;
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
        <div class="brand"><h1>Wakhan <em>Viewer</em></h1></div>
        ${active
          ? this.renderToolbar(active)
          : html`<div class="top-actions">
              <a href="https://genomespy.app/" target="_blank" rel="noopener noreferrer" class="powered">
                Powered by <strong>GenomeSpy ↗</strong>
              </a>
            </div>`}
      </header>
      ${active
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
                    Wakhan analyzes long-read tumor sequencing data to estimate
                    copy-number changes, including haplotype-specific profiles
                    when phasing is available.
                  </p>
                  <p>
                    This viewer opens a Wakhan results ZIP and displays its
                    copy-number, read-depth, BAF, and structural-variant tracks.
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
                      ${this.loadingExample ? "Loading example…" : "Load HCC1937 example"}
                    </button>
                  </div>
                  <p class="hint">
                    Or drop one or more ZIP files anywhere on this page. Files
                    are processed in your browser.
                  </p>
                </div>
              </main>`}
      ${active ? nothing : html`<footer class="footer">
        <span>Wakhan Viewer · ${this.renderProjectLinks()}</span>
        <span>
          Built with <a href="https://genomespy.app/">GenomeSpy</a> ·
          <a href="https://github.com/KolmogorovLab/Wakhan">Wakhan</a>
        </span>
      </footer>`}
      ${this.dragging ? html`<div class="drop-overlay">Drop Wakhan ZIP files to open them</div>` : nothing}
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
