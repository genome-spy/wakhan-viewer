import type { ExprRef } from "@genome-spy/core/spec/parameter.js";
import type { ParamApi } from "@genome-spy/core/types/embedApi.js";

export const wakhanColorNames = [
  "text",
  "textMuted",
  "textSubtle",
  "surface",
  "surfaceMuted",
  "border",
  "grid",
  "accent",
  "accentStrong",
  "hp1",
  "hp2",
  "total",
  "depthHp1",
  "depthHp2",
  "depthTotal",
  "loh",
  "svDeletion",
  "svInversion",
  "svInsertion",
  "svDuplication",
  "cytobandGneg",
  "cytobandGpos25",
  "cytobandGpos50",
  "cytobandGpos75",
  "cytobandGpos100",
  "cytobandAcen",
  "cytobandGvar",
  "cytobandStalk",
  "cytobandText",
  "cytobandTextInverse",
] as const;

type WakhanColor = (typeof wakhanColorNames)[number];
export type WakhanColors = Record<WakhanColor, string>;

const colorProperties = wakhanColorNames.map(
  (name) => "--color-" + name.replace(/[A-Z]/g, "-$&").toLowerCase(),
);

export function themeColor(name: WakhanColor): ExprRef {
  return { expr: `wakhanColors.${name}` };
}

/** Paint CSS colors into sRGB so GenomeSpy also accepts color-mix() and OKLab. */
export function readWakhanColors(host: HTMLElement): WakhanColors {
  const canvas = document.createElement("canvas");
  canvas.width = wakhanColorNames.length;
  canvas.height = 1;
  const context = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!context) throw Error("A 2D canvas is required to resolve theme colors.");

  const probe = host.appendChild(document.createElement("span"));
  probe.hidden = true;
  const hostStyle = getComputedStyle(host);
  const probeStyle = getComputedStyle(probe);

  try {
    colorProperties.forEach((property, index) => {
      const value = hostStyle.getPropertyValue(property).trim();
      if (!value || !CSS.supports("color", value)) {
        throw Error(`Missing or invalid theme color: ${property}`);
      }

      probe.style.color = `var(${property})`;
      context.fillStyle = probeStyle.color;
      context.fillRect(index, 0, 1, 1);
    });

    const pixels = context.getImageData(0, 0, canvas.width, 1).data;
    return Object.fromEntries(
      wakhanColorNames.map((name, index) => {
        const [r, g, b, alpha] = pixels.slice(index * 4, index * 4 + 4);
        const color =
          alpha === 255
            ? `rgb(${r}, ${g}, ${b})`
            : `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
        return [name, color];
      }),
    ) as WakhanColors;
  } finally {
    probe.remove();
  }
}

export function bindWakhanColors(
  host: HTMLElement,
  palette: ParamApi<WakhanColors>,
): () => void {
  const preference = matchMedia("(prefers-color-scheme: dark)");

  const refresh = () => {
    const colors = readWakhanColors(host);
    const previous = palette.getValue();
    if (wakhanColorNames.some((name) => previous[name] !== colors[name])) {
      palette.setValue(colors);
    }
  };

  // Appearance may have changed while embed() was initializing.
  refresh();

  preference.addEventListener("change", refresh);
  return () => preference.removeEventListener("change", refresh);
}
