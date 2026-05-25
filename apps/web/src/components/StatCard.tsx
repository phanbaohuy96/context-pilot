type StatCardProps = {
  label: string;
  value: number | string;
  description?: string;
};

export function StatCard({ label, value, description }: StatCardProps) {
  return (
    <section className="card">
      <h3>{label}</h3>
      <div className="stat">{value}</div>
      {description ? <p className="muted">{description}</p> : null}
    </section>
  );
}
