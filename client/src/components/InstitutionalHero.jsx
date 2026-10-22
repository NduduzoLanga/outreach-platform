export default function InstitutionalHero({ title, description }) {
  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-institute-forest">Azania Paragon Institute</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-black sm:text-4xl">{title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-black sm:text-base">{description}</p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-institute-forest/10 bg-white shadow-[0_16px_44px_rgba(6,60,43,0.12)]">
        <img
          alt="Early learning centre educators sharing a warm South African greeting"
          className="block h-auto max-h-[19rem] w-full object-cover object-center sm:max-h-[22rem]"
          src="/brand/ecd-south-african-greetings-header.gif"
        />
        <div aria-hidden="true" className="h-1 bg-gradient-to-r from-institute-gold via-institute-gold/80 to-institute-forest" />
      </div>
    </section>
  );
}
