import { createFileRoute, redirect } from "@tanstack/react-router";
import "./index.css";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/categories" });
  },
});
