# Reference annotation data

These files provide GRCh38 genomic context for Wakhan Viewer. They were copied
byte-for-byte from the verified outputs of the GenomeSpy
[HCC1954 Wakhan recipe, release v5](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer)
on 2026-09-29. Only filenames changed. No sample measurements are included here.

Recipe repository HEAD at inspection:
`cf3aa5b436aa877da7718a588e8dd172639dfa82`.
Output checksums, rather than that HEAD alone, identify the accepted data bytes.
The original source downloads occurred on the dates recorded below.

## Included files

| File | Contents | Rows |
| --- | --- | ---: |
| `ncg-7.2-grch38.tsv` | NCG 7.2 canonical drivers mapped to RefSeq spans | 593 loci / 591 genes |
| `cytobands-grch38.tsv` | UCSC hg38 chromosome bands | 862 |
| `provenance.json` | Source identities, retrieval dates, source/output hashes, and transfer record | — |

All intervals are **zero-based, half-open** on **GRCh38/hg38**, using `chr`
chromosome names. These annotations must only be enabled for a compatible assembly.

### Cancer genes

Original recipe output: `genes.tsv`.

- Gene classification/evidence: **Network of Cancer Genes 7.2**,
  `NCG_cancerdrivers_annotation_supporting_evidence.tsv`, retrieved 2026-09-05
  through the [NCG download form](http://www.network-cancer-genes.org/download.php)
  with `downloadcancergenes=Download`.
- Coordinates: UCSC's NCBI RefSeq curated transcript table,
  [`ncbiRefSeqCurated.txt.gz`](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/ncbiRefSeqCurated.txt.gz),
  retrieved 2026-09-03.
- Selection: all 591 genes classified as canonical cancer drivers by NCG; curated
  `NM_` transcripts on chr1–22/X/Y; union transcript spans for each
  `(symbol, chromosome, strand)`.
- CRLF2 and P2RY8 each have X/Y loci, giving 593 rows. No genes were selected based
  on either supplied Wakhan sample.
- `supportCount` is the number of distinct supporting PubMed IDs in NCG evidence
  rows for that gene. It controls label priority, not statistical significance.
- Columns: `chrom`, `start`, `end`, `symbol`, `strand`, `entrez`, `ncgClass`,
  `driverRole`, `supportCount`.

### Cytobands

Original recipe output: `cytobands.tsv`.

- Source: UCSC hg38
  [`cytoBandIdeo.txt.gz`](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBandIdeo.txt.gz),
  retrieved 2026-09-03.
- Transformation: retain chr1–22/X/Y, validate interval bounds, and emit the
  columns `chrom`, `start`, `end`, `band`, `stain` with a header.
- Cytobands are reference annotations. Wakhan's masking intervals come from the
  opened archive and have different semantics.

## Fingerprints and reproduction

```text
c4f8c1ab41e9125e96ec1e3d4bd5bed73a8dafbf91f349261b6365035f927ffc  ncg-7.2-grch38.tsv
c1d07d3aba76426c133c2e7ee2b345c80f3d02ced98b775d17a0f76ffac90325  cytobands-grch38.tsv
```

`provenance.json` also pins the downloaded NCG, RefSeq, and cytoband source bytes.
The UCSC URLs are mutable snapshots; a matching URL alone is not enough to
reproduce the accepted data.

The recipe's `scripts/prepare.py` contains `canonical_drivers()` and
`reference_annotations()`, which implement the transformations. Reproduce using
the recipe's pinned downloads and documented preparation/verification workflow,
then compare the output hashes above before copying or renaming. The full recipe
also prepares sample data and downloads a large Zenodo archive; ordinary app
development should use these already-verified annotation files. A future
annotation-only preparation script can reuse the documented transformation without
requiring that sample archive.

## Attribution and use

Credit NCG, NCBI RefSeq, and UCSC Genome Browser. Cite Dressler et al.,
**Comparative assessment of genes driving cancer and somatic evolution in
non-cancer tissues: an update of the Network of Cancer Genes (NCG) resource**,
Genome Biology (2022),
[DOI: 10.1186/s13059-022-02607-z](https://doi.org/10.1186/s13059-022-02607-z).
Its availability statement says the database can be freely downloaded without a
license requirement; the NCG download page requests citation.

The recipe's [rights assessment](https://github.com/genome-spy/genomespy-dataset-recipes/blob/main/recipes/hcc1954-wakhan-explorer/RIGHTS.md)
records UCSC's download policy and the absence of conflicting restrictions for
these hg38 tables. See the
[UCSC download conditions](https://hgdownload.soe.ucsc.edu/downloads.html) and
[hg38 database README](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/README.txt).
Preserve this attribution and the source/transform records when redistributing.
No author endorsement is implied. These third-party data are not relicensed by
an application source-code license or by the recipe's CC0 for original code/prose.

Wakhan's bundled COSMIC subset and the ZIPs' caller gene results are not the source
of the reference cancer-gene table above. Keep caller gene data separate and local
to the opened result.
