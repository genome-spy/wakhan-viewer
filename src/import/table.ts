// Upstream paths refer to KolmogorovLab/Wakhan at commit
// 38ca70e3df821837e97b6489101f2fccc86eb503; see docs/wakhan-zip-format.md.

export const number = (s: string, member: string, line: number): number => {
  const n = Number(s);
  if (!s || !Number.isFinite(n))
    throw Error(`${member}:${line}: invalid number ${JSON.stringify(s)}`);
  return n;
};
// Viewer restriction: GRCh38 primary chromosomes only, accepting either prefix.
// Wakhan's src/utils/chromosome.py:get_contigs_list can select other references
// and contigs; normalizing a chromosome name here does not establish its assembly.
export const chrom = (s: string): string =>
  /^chr(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(s)
    ? s
    : /^([1-9]|1\d|2[0-2]|X|Y)$/.test(s)
      ? `chr${s}`
      : "";
// src/coverage/binning.py:get_chromosomes_bins_hapcorrect and
// get_chromosomes_bins_bam start at 0, then advance with start = previous end + 1.
// src/coverage/segmentation.py:adjust_bps_cn_segments_boundries also uses end + 1.
// Map the observed CN/coverage convention to half-open viewer intervals without
// assuming a bin width. CN and gene writers preserve their input bounds without
// declaring base/closure; applying this conversion to them is a compatibility
// assumption for the observed archives, not a general rule for BED files.
export const interval = (fields: string[], member: string, line: number) => {
  const c = chrom(fields[0]);
  const start = Math.max(0, number(fields[1], member, line) - 1);
  const end = number(fields[2], member, line);
  if (!c || end <= start)
    throw Error(`${member}:${line}: invalid chromosome or interval`);
  return { chrom: c, start, end };
};

export function lines(text: string): { value: string; line: number }[] {
  return text
    .split(/\r?\n/)
    .map((value, i) => ({ value, line: i + 1 }))
    .filter((row) => !!row.value);
}

export function table(
  text: string,
  member: string,
  columns: string[],
  delimiter = "\t",
  commentHeader = false,
): string[][] {
  // Wakhan's BED writers prepend descriptive # comments and then a #chr column
  // header (src/output/writers.py:_write_segments_header and
  // src/output/genes.py:write_df_csv_header). Ranking TSVs have a plain header.
  const ls = lines(text);
  const headerLine = commentHeader
    ? [...ls].reverse().find((x) => x.value.startsWith("#chr\t"))
    : ls[0];
  if (commentHeader) {
    if (
      !headerLine ||
      headerLine.value.slice(1).split(delimiter).join("\t") !==
        columns.join("\t")
    )
      throw Error(`${member}: unexpected header`);
  } else if (columns.length && headerLine?.value !== columns.join(delimiter))
    throw Error(`${member}: unexpected header`);
  return ls
    .filter((x) =>
      commentHeader ? !x.value.startsWith("#") : x !== headerLine,
    )
    .map((x) => {
      const cells = x.value.split(delimiter);
      if (cells.length !== (columns.length || cells.length))
        throw Error(
          `${member}:${x.line}: expected ${columns.length} columns, found ${cells.length}`,
        );
      return cells;
    });
}
