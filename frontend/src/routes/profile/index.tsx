import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from "react";

export const Route = createFileRoute('/profile/')({
  component: RouteComponent,
})

function RouteComponent() {
  useEffect(() => {

  }, []);
  return <div>Hello "/profile/"!</div>
}
