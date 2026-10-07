# Wakhan Explorer

Open a Wakhan results ZIP in the browser and explore its copy-number calls,
read depth, structural variants, and folded BAF on linked genomic tracks.
The app parses the local file in a Worker; it has no data-upload endpoint.
Open one or more ZIPs at once, then switch between results to compare the same
genomic locus without losing your zoom. Files import in order; additional drops
join the queue. The first successful import is displayed, and adding files keeps
the current result and zoom. A failed file is reported without stopping the
remaining imports.

The app adapts the visual design of the
[HCC1954 Wakhan GenomeSpy recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer)
and the simple file-opening workflow of
[SegmentModel Spy](https://github.com/genome-spy/segment-model-spy).
It uses [GenomeSpy](https://genomespy.app/) Core's **minimal** entry point,
linked genomic scales, named data sources, and PNG/SVG image exports. ZIP-derived
rows are supplied to GenomeSpy through its runtime dataset API.

## Run locally

Requires a current Node.js release and npm.

~~~sh
npm ci
npm run dev
~~~

Open the URL printed by Vite, usually http://localhost:5173/. Choose one or more
ZIPs or drag them onto the page. The two supplied example ZIPs in ignored tmp/
are useful for development. Use the navigator, scroll wheel, drag, or locus
buttons to explore. Switch the result or integer/subclonal profile from the
toolbar; the detail x domain is retained.

~~~sh
npm run typecheck
npm run test:run
npm run build
npm run preview
~~~

The build is static. GitHub Pages can use GITHUB_PAGES=1 npm run build for
the /wakhan-explorer/ base path; deployment is not configured yet.

## What the current ZIPs support

The HCC1937 and HCC1954 ZIPs render phased HP1/HP2 integer and subclonal CN
profiles, raw 50 kb read depth, folded BAF, Severus SV links and sites,
centromeric/masked regions, GRCh38 cytobands, and NCG 7.2 cancer-driver genes.
Optional Wakhan LOH tables and the source's single-track unphased CN schema
have synthetic parser tests. No real ZIP for those modes was supplied, and
Wakhan's inspected ZIP exporter currently skips the unphased branch. Plot-only
purity/ploidy and phasing diagnostics need exported data before they can be
shown here.

The current ZIPs omit the enclosed solution identity, exact depth calibration,
independent assembly metadata, and explicit missingness information. The app
shows CN and raw depth on separate tracks and does not assign a ranked solution
to the plot. A source 3300 sentinel is treated as unavailable or masked;
BAF zero is shown with unknown SNP support. HP1/HP2 are chromosome-local
labels, CN confidence is not phasing confidence, and fractional CN is not a
cellular fraction.

See [the ZIP format report](docs/wakhan-zip-format.md) for observed shortcomings,
their effects, and exact fields requested from Wakhan's authors. The
[implementation plan](PLAN.md) records the architecture and original milestones.

## Development calibration experiment

The ordinary importer never invents the missing calibration. To inspect an
optional estimate based on rounded gene adjusted-depth centers, start the Vite
dev server and open http://localhost:5173/?calibrationPreview=1. The overlay
puts read-depth points and copy-number segments in the same HP1 and HP2 tracks,
with a calibrated read-depth axis on the right. It removes the separate raw-depth
tracks while the estimate is available. The view and its image exports are
marked **Estimated calibration — development**.
It is recalculated per archive, excludes genes overlapping masked subclonal
segments, and appears only if the distinct-state fit passes rounding and
stability checks. It has not been validated against Wakhan's Plotly parameters.
The production build excludes this preview.

For a numerical report without the browser:

~~~sh
npm run calibration:estimate -- tmp/HCC1954_plots_data.zip
~~~

## Reference data and citations

Bundled GRCh38 annotations live in [data/](data/README.md), with source URLs,
transformation details, checksums, and attribution. NCG literature counts rank
labels; they are not measures of sample-specific significance.

- Ahmad et al., *Wakhan: reconstruction of chromosome-scale copy number
  profiles of tumor genomes with long-read sequencing* (2025 preprint),
  [DOI: 10.64898/2025.12.11.25342098](https://doi.org/10.64898/2025.12.11.25342098).
- Lavikka et al., *Deciphering Cancer Genomes with GenomeSpy: A Grammar-Based
  Visualization Toolkit*, GigaScience (2024),
  [DOI: 10.1093/gigascience/giae040](https://doi.org/10.1093/gigascience/giae040).
- Keskus et al., *Severus* structural variants,
  [DOI: 10.1038/s41587-025-02618-8](https://doi.org/10.1038/s41587-025-02618-8).
- Dressler et al., Network of Cancer Genes 7.2,
  [DOI: 10.1186/s13059-022-02607-z](https://doi.org/10.1186/s13059-022-02607-z).
- [UCSC Genome Browser](https://genome.ucsc.edu/) and
  [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) provide genomic context.

The original recipe used published
[Wakhan/CASTLE data on Zenodo](https://zenodo.org/records/17780982). Its
sample-specific claims and rights do not automatically apply to arbitrary
ZIPs opened in this app.
