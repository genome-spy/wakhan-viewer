import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { DatumSearchMatch } from "@genome-spy/core/types/search.js";
import type { GenomeSearch } from "./visualization/search";
import "./locationSearch.css";

@customElement("wakhan-location-search")
export class LocationSearch extends LitElement {
  @property({ attribute: false }) search?: GenomeSearch;
  @property({ type: Boolean }) disabled = false;
  @state() private region = "";
  @state() private draft = "";
  @state() private open = false;
  @state() private error = "";
  @state() private navigating = false;
  @state() private choices: DatumSearchMatch[] = [];
  @query("input") private input!: HTMLInputElement;
  private unsubscribe?: () => void;
  private editing = false;

  // Plot gestures can prevent native blur, so observe outside presses in capture.
  private onOutsidePointerDown = (event: PointerEvent) => {
    if ((!this.open && !this.editing) || event.composedPath().includes(this))
      return;

    const active = this.ownerDocument.activeElement;
    if (active instanceof HTMLElement && this.contains(active)) active.blur();
    this.dismiss();
  };

  connectedCallback() {
    super.connectedCallback();
    this.ownerDocument.addEventListener(
      "pointerdown",
      this.onOutsidePointerDown,
      true,
    );
  }

  protected createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("search")) {
      this.unsubscribe?.();
      const search = this.search;
      this.unsubscribe = search?.subscribe(() => {
        this.region = search.region();
        if (!this.editing && !this.error && !this.choices.length)
          this.draft = this.region;
      });
      this.region = this.search?.region() ?? "";
      this.draft = this.region;
      this.navigating = false;
    }
    if (changed.has("search") || (changed.has("disabled") && this.disabled)) {
      this.open = false;
      this.error = "";
      this.choices = [];
    }
  }

  disconnectedCallback() {
    this.ownerDocument.removeEventListener(
      "pointerdown",
      this.onOutsidePointerDown,
      true,
    );
    this.unsubscribe?.();
    super.disconnectedCallback();
  }

  private onFocus() {
    this.editing = true;
    this.open = true;
    this.input.select();
  }

  private onInput() {
    this.draft = this.input.value;
    this.error = "";
    this.choices = [];
    this.open = true;
  }

  private dismiss() {
    this.editing = false;
    this.open = false;
    if (!this.error && !this.choices.length) this.draft = this.region;
  }

  private onKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      this.draft = this.region;
      this.error = "";
      this.choices = [];
      this.open = false;
      this.input.blur();
    }
  }

  private async run(value: string | DatumSearchMatch) {
    const search = this.search;
    if (!search || this.disabled || this.navigating) return;
    this.error = "";
    this.navigating = true;
    try {
      let matches: DatumSearchMatch[] = [];
      if (typeof value === "string") {
        this.draft = value;
        matches = await search.search(value);
      } else {
        await search.navigate(value);
      }
      if (search !== this.search || this.disabled) return;

      this.choices = matches;
      this.region = search.region();
      if (!matches.length) this.draft = this.region;
      this.open = matches.length > 0;
      // Select the rendered value so the subsequent update cannot move the caret.
      await this.updateComplete;
      if (search !== this.search || this.disabled) return;
      this.input.focus();
      this.input.select();
      this.open = matches.length > 0;
    } catch (error) {
      if (search !== this.search || this.disabled) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.open = true;
    } finally {
      if (search === this.search) this.navigating = false;
    }
  }

  render() {
    return html`<form
      class="location-search"
      role="search"
      aria-label="Navigate to a genomic region"
      aria-busy=${this.navigating}
      @submit=${(event: SubmitEvent) => {
        event.preventDefault();
        void this.run(this.draft);
      }}
      @focusout=${(event: FocusEvent) => {
        if (!this.contains(event.relatedTarget as Node | null)) {
          this.dismiss();
        }
      }}
    >
      <label class="sr-only" for="genome-location"
        >Genomic coordinate or gene</label
      >
      <input
        id="genome-location"
        type="text"
        placeholder="Coordinate or gene"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="location-search-help"
        aria-invalid=${this.error ? "true" : "false"}
        ?disabled=${this.disabled || !this.search}
        ?readonly=${this.navigating}
        .value=${this.draft}
        @focus=${this.onFocus}
        @input=${this.onInput}
        @keydown=${this.onKeyDown}
      />
      <span class="location-search-enter" aria-hidden="true">↵</span>
      <div
        id="location-search-help"
        class="location-search-panel"
        ?hidden=${!this.open}
      >
        ${this.error ? html`<p class="location-search-error" role="alert">${this.error}</p>` : nothing}
        ${
          this.choices.length
            ? html`<p>Choose a gene locus:</p>
                <ul class="location-search-matches">
                  ${this.choices.map(
                    (match) =>
                      html`<li>
                        <button
                          type="button"
                          ?disabled=${this.navigating}
                          @click=${() => this.run(match)}
                        >
                          ${match.datum.symbol}
                          <span>${match.datum.chrom}</span>
                        </button>
                      </li>`,
                  )}
                </ul>`
            : html`<p>Go to a chromosome or region:</p>
                <div class="location-search-examples">
                  ${["chr8", "chr8:21,445,873-24,623,697"].map((term) => this.example(term))}
                </div>
                <p>Or search the bundled cancer-driver genes:</p>
                <div class="location-search-examples">
                  ${(this.search?.examples ?? []).map((term) => this.example(term))}
                </div>
                <p class="location-search-hint">
                  GRCh38. Press Enter to search or Esc to cancel.
                </p>`
        }
      </div>
    </form>`;
  }

  private example(term: string) {
    return html`<button
      type="button"
      ?disabled=${this.navigating}
      @click=${() => this.run(term)}
    >
      ${term}
    </button>`;
  }
}
