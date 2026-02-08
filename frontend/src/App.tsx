import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { NavigationEventListener } from "./events/NagivationEventListener";
import Landing from "./pages/Landing";
import Canvas from "./pages/Canvas";

export default function App() {
  return (
    <ErrorBoundary>
      <Theme>
        <AuthProvider>
          <Toaster position="bottom-center" richColors />
          <BrowserRouter>
            <NavigationEventListener />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/canvas" element={<Canvas />} />
              <Route path="/app" element={<Canvas />} />
              {/* All other routes redirect to landing */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </Theme>
    </ErrorBoundary>
  );
}
