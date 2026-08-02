import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { Code, ConnectError } from "@connectrpc/connect";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { routeTree } from "./routeTree.gen";
import { theme } from "@/styles/theme";
import { appBackground } from "@/styles/glass";
import { AuthProvider, useAuthActions, useAuthState } from "@/providers/AuthProvider";

const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      setIsAuthenticated: () => {},
      login: () => {},
      logout: () => {},
    } as any,
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const connectErr = ConnectError.from(error);
        if (connectErr.code === Code.NotFound || connectErr.code === Code.PermissionDenied) {
          return false;
        }
        return failureCount < 2;
      },
      throwOnError: false,
      refetchOnWindowFocus: false,
    },
  },
});

function InnerApp() {
  const state = useAuthState();
  const actions = useAuthActions();
  const auth = { ...state, ...actions };
  return <RouterProvider router={router} context={{ auth }} />;
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            body: {
              minHeight: "100vh",
              background: appBackground,
              backgroundAttachment: "fixed",
            },
          }}
        />
        <QueryClientProvider client={queryClient}>
          <AuthProvider router={router}>
            <InnerApp />
          </AuthProvider>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" position="bottom" />
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
