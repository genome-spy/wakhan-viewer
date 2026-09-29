import genesText from "../data/ncg-7.2-grch38.tsv?raw";
import cytobandsText from "../data/cytobands-grch38.tsv?raw";
import type { Row } from "./model";

function tsv(text: string): Row[] {
  const [header, ...body] = text.trim().split(/\r?\n/);
  const fields = header.split("\t");
  return body.map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(
      fields.map((field, i) => [
        field,
        ["start", "end", "supportCount"].includes(field)
          ? Number(values[i])
          : values[i],
      ]),
    );
  });
}

export const genes = tsv(genesText);
export const cytobands = tsv(cytobandsText);
