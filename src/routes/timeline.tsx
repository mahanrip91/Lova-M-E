import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/timeline")({
  beforeLoad: () => {
    throw redirect({ to: "/chat", search: { u: "", at: 0 } });
  },
});
