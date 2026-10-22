export default function StatCard({ label, value = "—" }) {
  return (
    <article className="rounded-xl border border-institute-forest/10 border-t-2 border-t-institute-gold bg-white p-5 shadow-[0_3px_14px_rgba(6,60,43,0.04)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}
