import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import scrollAndZoom from "./assets/scrollAndZoom.svg?raw";
import "./navigationHelp.css";

const hideNavigationHelpKey = "wakhan-viewer.hide-navigation-help";

@customElement("wakhan-navigation-help")
export class NavigationHelp extends LitElement {
  @state() private hideOnLoad = false;
  @query("dialog") private dialog!: HTMLDialogElement;
  private shown = false;

  protected createRenderRoot() {
    return this;
  }

  async show() {
    this.hideOnLoad = localStorage.getItem(hideNavigationHelpKey) === "true";
    await this.updateComplete;
    this.dialog.showModal();
  }

  async showOnce() {
    if (this.shown) return;
    this.shown = true;
    if (localStorage.getItem(hideNavigationHelpKey) !== "true") {
      await this.show();
    }
  }

  private changePreference(event: Event) {
    this.hideOnLoad = (event.target as HTMLInputElement).checked;
    if (this.hideOnLoad) {
      localStorage.setItem(hideNavigationHelpKey, "true");
    } else {
      localStorage.removeItem(hideNavigationHelpKey);
    }
  }

  render() {
    return html`<dialog
      class="navigation-help"
      aria-labelledby="navigation-help-title"
      aria-describedby="navigation-help-description"
    >
      <h2 id="navigation-help-title">Navigate the genome</h2>
      <p id="navigation-help-description">
        Pan across chromosomes and zoom into the details.
      </p>
      <div class="navigation-help-illustration">
        ${unsafeSVG(scrollAndZoom)}
      </div>
      <p>
        Zoom follows your pointer. In the genome navigator above the tracks,
        double-click to reset the selection, then drag to choose a region.
      </p>
      <form method="dialog" class="navigation-help-actions">
        <label>
          <input
            type="checkbox"
            .checked=${this.hideOnLoad}
            @change=${this.changePreference}
          />
          Don't show this again
        </label>
        <button class="primary" autofocus>Start exploring</button>
      </form>
    </dialog>`;
  }
}
