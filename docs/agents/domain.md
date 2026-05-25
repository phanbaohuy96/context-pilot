# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a single-context layout.

Read these when they exist:

- `CONTEXT.md` at the repo root
- `docs/adr/` at the repo root

If these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront. Producer skills can create them lazily when terms or decisions get resolved.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept isn't in the glossary yet, note it for `/grill-with-docs`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding.
