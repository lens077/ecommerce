import { createFileRoute } from "@tanstack/react-router";

function CartPage() {
  return <>cart</>;
}

export const Route = createFileRoute("/cart/")({
  component: CartPage,
});
