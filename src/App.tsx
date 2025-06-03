
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/auth/AuthGuard";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import InsuranceVerification from "./pages/InsuranceVerification";
import Claims from "./pages/Claims";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <AuthGuard>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/patients" element={
              <AuthGuard>
                <DashboardLayout>
                  <Patients />
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/verification" element={
              <AuthGuard>
                <DashboardLayout>
                  <InsuranceVerification />
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/claims" element={
              <AuthGuard>
                <DashboardLayout>
                  <Claims />
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/payments" element={
              <AuthGuard>
                <DashboardLayout>
                  <div className="p-6">
                    <h1 className="text-2xl font-bold mb-4">Payments</h1>
                    <p>This page is under construction.</p>
                  </div>
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/reports" element={
              <AuthGuard>
                <DashboardLayout>
                  <div className="p-6">
                    <h1 className="text-2xl font-bold mb-4">Reports</h1>
                    <p>This page is under construction.</p>
                  </div>
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="/settings" element={
              <AuthGuard>
                <DashboardLayout>
                  <div className="p-6">
                    <h1 className="text-2xl font-bold mb-4">Settings</h1>
                    <p>This page is under construction.</p>
                  </div>
                </DashboardLayout>
              </AuthGuard>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
