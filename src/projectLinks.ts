import { html } from "lit";

export function renderProjectLinks() {
  return html`<span class="project-links">
    <a
      href="https://github.com/genome-spy/wakhan-viewer"
      target="_blank"
      rel="noopener noreferrer"
      >GitHub</a
    >
    <a
      href="https://github.com/genome-spy/wakhan-viewer/blob/main/LICENSE"
      target="_blank"
      rel="noopener noreferrer"
      >MIT license</a
    >
  </span>`;
}
