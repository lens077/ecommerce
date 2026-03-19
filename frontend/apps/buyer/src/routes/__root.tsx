import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import PrivacyConsent from "@/components/PrivacyConsent.tsx";
import Footer from "@/components/Footer.tsx";
import { Box } from "@mui/material";

export const Route = createRootRoute({
  component: () => {
    const handleConsent = (settings: any) => {
      console.log("Privacy consent settings:", settings);
      // 这里可以根据用户的隐私设置执行相应的操作
    };

    return (
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Outlet />
        <Footer />
        <PrivacyConsent onConsent={handleConsent} />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      </Box>
    );
  },
});
