export default function DataTable({ columns = [], rows = [], emptyMessage = "No records yet." }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>{columns.map((column) => <th className="px-4 py-3 font-medium" key={column}>{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row.id || index}>{columns.map((column) => <td className="px-4 py-3" key={column}>{row[column] ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
