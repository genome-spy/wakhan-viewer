import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Profile, WakhanResult } from "./model";
import { genes, cytobands } from "./annotations";
import { ExplorerView, type Domain } from "./visualization/controller";
import zipReportUrl from "../docs/wakhan-zip-format.md?url";
import type { CalibrationEstimate } from "./dev/calibration";
import { layoutSignature } from "./visualization/spec";

const loci: Record<string, Domain> = {
  all: [
    { chrom: "chr1", pos: 0 },
    { chrom: "chrY", pos: 57227415 },
  ],
  chr8: [
    { chrom: "chr8", pos: 0 },
    { chrom: "chr8", pos: 145138636 },
  ],
  myc: [
    { chrom: "chr8", pos: 120000000 },
    { chrom: "chr8", pos: 135000000 },
  ],
  erbb2: [
    { chrom: "chr17", pos: 37000000 },
    { chrom: "chr17", pos: 42000000 },
  ],
};
const previewEnabled =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("calibrationPreview");
const calibrationTools = import.meta.env.DEV
  ? await import("./dev/calibration")
  : undefined;

@customElement("wakhan-explorer")
export class WakhanExplorer extends LitElement {
  @state() private loaded: WakhanResult[] = [];
  @state() private active = -1;
  @state() private profile: Profile = "integer";
  @state() private busy = false;
  @state() private dragging = false;
  @state() private message = "";
  @state() private exportBusy = false;
  @state() private previewEstimate?: CalibrationEstimate;
  private view?: ExplorerView;
  private viewLayout?: string;
  private worker?: Worker;
  private fileInput?: HTMLInputElement;
  private loadSequence = 0;
  private statusTimer?: number;

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

  private signature(result: WakhanResult) {
    return `${layoutSignature(result)}:${previewEnabled && !!this.previewEstimate}`;
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

  private async open(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      this.status("Choose a Wakhan ZIP file.", true);
      return;
    }
    this.busy = true;
    this.status(`Reading ${file.name}…`, true);
    this.worker?.terminate();
    const seq = ++this.loadSequence;
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
      if (seq !== this.loadSequence) return;
      const prior = this.view?.domain();
      this.loaded = [...this.loaded, result];
      this.active = this.loaded.length - 1;
      this.profile = result.profiles.includes(this.profile)
        ? this.profile
        : result.profiles[0];
      this.previewEstimate = previewEnabled
        ? calibrationTools?.estimateCalibration(result)
        : undefined;
      await this.updateComplete;
      const layout = this.signature(result);
      if (this.view && this.viewLayout !== layout) {
        this.view.dispose();
        this.view = undefined;
      }
      if (!this.view) {
        const host = this.querySelector<HTMLElement>("#vis");
        if (!host) throw Error("Visualization container was not created.");
        const view = new ExplorerView(host);
        await view.initialize(
          genes,
          cytobands,
          result,
          previewEnabled ? this.previewEstimate : undefined,
        );
        this.view = view;
        this.viewLayout = layout;
      }
      this.view.show(result, this.profile, !!prior, this.previewRows(result));
      if (prior) this.view.zoom(prior, 0);
      this.status(`${result.name} ready`);
    } catch (error) {
      this.status(error instanceof Error ? error.message : String(error), true);
    } finally {
      worker.terminate();
      if (this.worker === worker) this.worker = undefined;
      if (seq === this.loadSequence) this.busy = false;
    }
  }

  private activate(index: number) {
    const result = this.loaded[index];
    if (!result || !this.view) return;
    const prior = this.view.domain();
    this.active = index;
    this.profile = result.profiles.includes(this.profile)
      ? this.profile
      : result.profiles[0];
    this.previewEstimate = previewEnabled
      ? calibrationTools?.estimateCalibration(result)
      : undefined;
    if (this.viewLayout !== this.signature(result)) {
      this.busy = true;
      this.status(`Opening ${result.name}…`, true);
      this.view.dispose();
      this.view = undefined;
      void this.updateComplete.then(async () => {
        const host = this.querySelector<HTMLElement>("#vis");
        if (!host) {
          this.busy = false;
          return;
        }
        const view = new ExplorerView(host);
        try {
          await view.initialize(
            genes,
            cytobands,
            result,
            previewEnabled ? this.previewEstimate : undefined,
          );
          this.view = view;
          this.viewLayout = this.signature(result);
          view.show(result, this.profile, false, this.previewRows(result));
          if (prior) view.zoom(prior, 0);
          this.status(`${result.name} ready`);
        } catch (error) {
          this.status(`Visualization failed: ${String(error)}`, true);
        } finally {
          this.busy = false;
        }
      });
    } else {
      this.view.show(result, this.profile, true, this.previewRows(result));
      this.status(`${result.name} ready`);
    }
  }

  private changeProfile(value: Profile) {
    const result = this.loaded[this.active];
    if (!result?.profiles.includes(value) || !this.view) return;
    this.profile = value;
    this.view.show(result, value, true, this.previewRows(result));
  }

  private previewRows(result: WakhanResult) {
    return this.previewEstimate && previewEnabled
      ? (calibrationTools?.calibratedCoverage(
          result.coverage,
          this.previewEstimate,
        ) ?? [])
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
    this.dragging = true;
  }
  private onDrop(event: DragEvent) {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    this.dragging = false;
    void this.open(event.dataTransfer.files[0]);
  }

  render() {
    const active = this.loaded[this.active];
    return html` <div
      class="app ${this.dragging ? "dragging" : ""}"
      @dragover=${this.onDragOver}
      @dragleave=${() => (this.dragging = false)}
      @drop=${this.onDrop}
    >
      <input
        class="sr-only"
        type="file"
        accept=".zip,application/zip"
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          void this.open(input.files?.[0]);
          input.value = "";
        }}
      />
      <header class="masthead">
        <div class="brand">
          <h1>Wakhan <em>Explorer</em></h1>
        </div>
        <div class="top-actions">
          ${active ? html`<button class="primary" @click=${this.openPicker} ?disabled=${this.busy}>Open ZIP</button>` : nothing}
          <a
            href="https://genomespy.app/"
            target="_blank"
            rel="noopener noreferrer"
            class="powered"
            >Powered by <strong>GenomeSpy ↗</strong></a
          >
        </div>
      </header>
      ${
          active
            ? html` <main class="workspace">
                <section class="toolbar" aria-label="Explore results">
                  <div class="control">
                    <label for="result-select">Result</label
                    ><select
                      id="result-select"
                      ?disabled=${this.busy}
                      @change=${(e: Event) => this.activate(Number((e.target as HTMLSelectElement).value))}
                    >
                      ${this.loaded.map((_r, i) => html`<option value=${i} ?selected=${i === this.active}>${this.labelFor(i)}</option>`)}
                    </select>
                  </div>
                  <div class="control">
                    <label for="profile-select">Profile</label
                    ><select
                      id="profile-select"
                      ?disabled=${this.busy}
                      @change=${(e: Event) => this.changeProfile((e.target as HTMLSelectElement).value as Profile)}
                    >
                      ${active.profiles.map((p) => html`<option value=${p} ?selected=${p === this.profile}>${p === "integer" ? "Integer CN" : "Subclonal CN"}</option>`)}
                    </select>
                  </div>
                  <div class="loci" role="group" aria-label="Genomic region">
                    <button @click=${() => this.view?.zoom(loci.all)}>
                      Genome</button
                    ><button @click=${() => this.view?.zoom(loci.chr8)}>
                      Chr 8</button
                    ><button @click=${() => this.view?.zoom(loci.myc)}>
                      MYC</button
                    ><button @click=${() => this.view?.zoom(loci.erbb2)}>
                      ERBB2
                    </button>
                  </div>
                  <div class="exports" role="group" aria-label="Export image">
                    <button
                      ?disabled=${this.exportBusy || this.busy}
                      @click=${() => this.exportImage("png")}
                    >
                      PNG ↓</button
                    ><button
                      ?disabled=${this.exportBusy || this.busy}
                      @click=${() => this.exportImage("svg")}
                    >
                      SVG ↓
                    </button>
                  </div>
                </section>
                <div class="viewer-head">
                  <div>
                    <strong>${active.name}</strong
                    ><span>
                      · GRCh38 ·
                      ${active.segments[this.profile].length / (active.mode === "phased" ? 2 : 1)}
                      CN intervals · ${active.mode}</span
                    >
                  </div>
                  <small
                    >Scroll to zoom · drag to pan · navigator to brush</small
                  >
                </div>
                ${previewEnabled ? html`<div class="preview-banner">${this.previewEstimate ? html`Estimated calibration — development · offset ${this.previewEstimate.offset.toFixed(3)} · depth per copy ${this.previewEstimate.singleCopyDepth.toFixed(3)} · not verified against Wakhan plot parameters` : "Estimated calibration preview unavailable for this ZIP"}</div>` : nothing}
                <div
                  id="vis"
                  class=${this.busy ? "is-loading" : ""}
                  aria-label="Interactive genomic tracks"
                ></div>
                <details class="details">
                  <summary>
                    About these results
                    <span>${active.diagnostics.length} notes</span>
                  </summary>
                  <p>
                    HP1 and HP2 are chromosome-local labels. Wakhan CN
                    confidence is distinct from phasing confidence. The ZIP does
                    not include the calibration for a combined depth and CN
                    axis.
                  </p>
                  <ul>
                    ${active.diagnostics.map((d) => html`<li class=${d.level}>${d.message}</li>`)}
                  </ul>
                  <p>
                    ${active.svLinks.length} SV links · ${active.svSites.length}
                    SV sites ·
                    ${active.baf.filter((b) => b.baf !== null).length} BAF bins
                    ·
                    ${active.lohAvailable ? `${active.loh.length} LOH intervals` : "LOH not supplied"}
                    · ${active.rankings.length} ranked solutions (included
                    solution unspecified) · VCF sample
                    ${active.vcfSample ?? "not supplied"}.
                  </p>
                  <a
                    href=${zipReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    >Wakhan ZIP format findings ↗</a
                  >
                </details>
              </main>`
            : html` <main class="welcome">
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
                  <button
                    class="primary large"
                    @click=${this.openPicker}
                    ?disabled=${this.busy}
                  >
                    Open ZIP file
                  </button>
                  <p class="hint">
                    Or drop a ZIP file anywhere on this page. The file is
                    processed in your browser.
                  </p>
                </div>
              </main>`
        }
      <footer class="footer">
        <span>Wakhan Explorer</span
        ><span
          >Built with <a href="https://genomespy.app/">GenomeSpy</a> ·
          <a href="https://github.com/KolmogorovLab/Wakhan">Wakhan</a></span
        >
      </footer>
      ${this.dragging ? html`<div class="drop-overlay">Drop your Wakhan ZIP to open it</div>` : nothing}
      <div class="status" role="status" aria-live="polite">
        ${this.message}${this.busy ? " Working…" : ""}
      </div>
    </div>`;
  }
}
