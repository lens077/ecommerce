import { createFileRoute } from "@tanstack/react-router";
import { AddressBookPage } from "@/components/address/AddressBookPage";
import { requireLogin } from "@/lib/requireLogin";

export const Route = createFileRoute("/profile/addresses/")({
  component: AddressBookPage,
  beforeLoad: requireLogin("consumer:addresses.loginRequired"),
});
