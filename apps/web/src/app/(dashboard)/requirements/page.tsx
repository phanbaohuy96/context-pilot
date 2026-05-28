import { revalidatePath } from "next/cache";
import { prisma } from "@context-pilot/db";

export const dynamic = "force-dynamic";

async function updateRequirementStatus(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "NEW") as "NEW" | "CONFIRMED" | "REJECTED";

  await prisma.requirement.update({ where: { id }, data: { status } });
  revalidatePath("/requirements");
}

export default async function RequirementsPage() {
  const requirements = await prisma.requirement.findMany({
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <header className="page-header">
        <h2>Requirement review</h2>
        <p>Confirm, reject, and use extracted cards as quoting inputs with evidence links.</p>
      </header>

      <section className="card stack">
        {requirements.length ? requirements.map((requirement) => (
          <article key={requirement.id} className="card">
            <div className="grid grid-2">
              <div>
                <h3>{requirement.title}</h3>
                <p className="muted">
                  {requirement.source.displayName} · <span className="badge">{requirement.category}</span> · <span className="badge">{requirement.status}</span>
                </p>
                <p>{requirement.description}</p>
                {requirement.priority ? <p><strong>Priority:</strong> {requirement.priority}</p> : null}
                <p className="muted">Evidence: {requirement.evidenceMessageIds.join(", ")}</p>
              </div>
              <form action={updateRequirementStatus} className="form-grid">
                <input type="hidden" name="id" value={requirement.id} />
                <button type="submit" name="status" value="CONFIRMED">Confirm</button>
                <button className="secondary" type="submit" name="status" value="NEW">Mark new</button>
                <button className="danger" type="submit" name="status" value="REJECTED">Reject</button>
              </form>
            </div>
          </article>
        )) : <p className="muted">No requirement cards extracted yet.</p>}
      </section>
    </>
  );
}
