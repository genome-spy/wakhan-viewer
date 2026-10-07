# Specification provenance

`structural-variants.json` is adapted from the HCC1954 Wakhan Explorer recipe
at commit `cf3aa5b436aa877da7718a588e8dd172639dfa82` in the
[GenomeSpy dataset recipes](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer/specs).
The recipe's [rights review](https://github.com/genome-spy/genomespy-dataset-recipes/blob/main/recipes/hcc1954-wakhan-explorer/RIGHTS.md)
states that its original specs are CC0. This copy replaces sample-specific
file URLs with the `svLinks` and `svSites` named sources. The app supplies
normalized Severus VCF records to those sources through GenomeSpy's API.

`../spec.ts` follows the same recipe for the navigator, title and axis styling,
linked rulers, interval brush, BAF markers, masks, cytobands, and gene labels.
Its tracks are assembled according to the files present in each ZIP. Wakhan's
current ZIPs omit the plot's read-depth-to-copy-number calibration. The viewer
infers a mapping from rounded gene values by default, restoring the recipe's
layered HP tracks and calibrated right-side depth axis when the fit passes its
checks. About highlights the estimate's unverified agreement with Wakhan's plot.
Without a consistent estimate, CN and raw depth use separate tracks. The ZIPs also
do not distinguish all unavailable calls from genuine zeros; see
[ZIP format findings](../../../docs/wakhan-zip-format.md).
