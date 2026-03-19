import { createFileRoute } from "@tanstack/react-router";
import AppBar from "@/components/AppBar";
import "./index.css";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return <AppBar />;
}
