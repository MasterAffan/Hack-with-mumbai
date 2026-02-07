import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import CanvasPage from "./pages/Canvas";
import Landing from "./pages/Landing";

export default function App() {
  return (
    <ErrorBoundary>
      <Theme>
        <Toaster position="bottom-center" richColors />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="/app" element={<CanvasPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </Theme>
    </ErrorBoundary>
  );
}
