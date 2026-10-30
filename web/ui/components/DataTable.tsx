import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

export const TEXT_EMPTY_TABLE = "Sin datos para este día.";

export function DataTable<T>({ caption, columns, rows, rowKey }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string }) {
  if (rows.length === 0) {
    return (
      <section>
        <h3>{caption}</h3>
        <p>{TEXT_EMPTY_TABLE}</p>
      </section>
    );
  }
  return (
    <section>
      <h3>{caption}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={c.numeric ? "numeric" : undefined}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.header} className={c.numeric ? "numeric" : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
