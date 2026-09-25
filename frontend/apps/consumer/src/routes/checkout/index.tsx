import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

export const Route = createFileRoute("/checkout/")({ component: CheckoutPage });
