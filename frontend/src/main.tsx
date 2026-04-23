import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import { Shell } from "@/components/Shell";
import { Overview } from "@/pages/Overview";
import { Pipeline } from "@/pages/Pipeline";
import { Roles } from "@/pages/Roles";
import { RoleDetail } from "@/pages/RoleDetail";
import { Velocity } from "@/pages/Velocity";
import { Sources } from "@/pages/Sources";
import { People } from "@/pages/People";
import { Settings } from "@/pages/Settings";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="roles" element={<Roles />} />
            <Route path="roles/:jobId" element={<RoleDetail />} />
            <Route path="velocity" element={<Velocity />} />
            <Route path="sources" element={<Sources />} />
            <Route path="people" element={<People />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
