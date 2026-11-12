import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/timeline")({
  validateSearch: (s: Record<string, unknown>) => ({
    u: typeof s["u"] === "string" ? s["u"] : "",
    at: Number(s["at"]) || 0,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/chat", search: { u: search.u, at: search.at } });
  },
});
