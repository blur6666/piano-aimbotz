# Catalog data

`v1.ts` is the versioned catalog: 3 progression groups, 12 physical major
scales, 38 exercises (ascending + descending per scale, with two-octave
variants for the seven scales whose fingering is sourced), right hand only.
It is validated by `src/domain/catalog` before `npm run seed` inserts it.

## Provenance

Primary source: `fingering-reference-pianoscales-org.png`, a piano
fingering table attributed to pianoscales.org — SPEC.md's declared
"fingering data source of record".

Cross-checked against an independent source,
`major-minor-scales-fingerings.tsv`.

Group 1 (C, G, D, A, E, B — shared 1-2-3-1-2-3-4-5 pattern) and Group 2 (F)
match both sources exactly, and match SPEC.md's explicit tables.

Group 3 (black-key scales) required reconciling the two sources by hand:

| Scale | pianoscales.org | TSV / SPEC.md prose | Used |
| --- | --- | --- | --- |
| B♭ | 2-1-2-3-1-2-3-4 | 4-1-2-3-1-2-3-4 | pianoscales.org |
| E♭ | 2-1-2-3-4-1-2-3 | 3-1-2-3-4-1-2-3 | pianoscales.org |
| A♭ | 2-3-1-2-3-1-2-3 | 3-4-1-2-3-1-2-3 | TSV |
| D♭ | 2-3-1-2-3-4-1-2 | 2-3-1-2-3-4-1-2 | agree |
| G♭/F♯ | 2-3-4-1-2-3-1-2 | 2-3-4-1-2-3-1-2 | agree |

For B♭ and E♭, only the first finger differs between the two sources —
every other digit is identical — and the unused alternate is kept as a
comment next to each scale in `v1.ts` rather than silently discarded. For
A♭ there is a genuine two-digit disagreement with no SPEC.md tiebreaker;
the unused pianoscales.org value is likewise kept as a comment.

Descending fingering, offsets, and note order are not sourced separately —
they are mechanically derived by reversing the ascending data (see
`buildExercises` in `v1.ts`), matching the precedent already set for C
major descending.
