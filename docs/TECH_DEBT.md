# Technical Debt
<!-- UNIVERSAL: empieza vacío y se llena durante el desarrollo. Cada vez que se deja algo "para después" o se acepta una solución temporal, se anota aquí. -->

| Date | Item | Impact | Proposed fix |
|---|---|---|---|
| 2026-11-04 | The 9 usage charts of "Consumo de planes" draw every account, with no way to pick some (spec 003, T6). | Fine with 3 accounts; with more, the lines pile up, the scale follows the largest account and the smaller ones read as flat at 0; only 3 validated colors exist. | A client filter above the charts (one row, scoping all 9), to pick one or a few accounts; colors stay with each account, never reassigned by the filter. New spec when clients grow. |
