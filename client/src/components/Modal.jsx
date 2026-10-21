export default function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/40 p-4" onClick={onClose} role="presentation">
      <section aria-labelledby="modal-title" aria-modal="true" className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold" id="modal-title">{title}</h2>
          <button aria-label="Close dialog" className="text-slate-500" onClick={onClose} type="button">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
