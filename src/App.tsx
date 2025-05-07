
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Claims from "./pages/Claims";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <DashboardLayout>
              <Dashboard />
            </DashboardLayout>
          } />
          <Route path="/patients" element={
            <DashboardLayout>
              <Patients />
            </DashboardLayout>
          } />
          <Route path="/verification" element={
            <DashboardLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Insurance Verification</h1>
                <p>This page is under construction.</p>
              </div>
            </DashboardLayout>
          } />
          <Route path="/claims" element={
            <DashboardLayout>
              <Claims />
            </DashboardLayout>
          } />
          <Route path="/payments" element={
            <DashboardLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Payments</h1>
                <p>This page is under construction.</p>
              </div>
            </DashboardLayout>
          } />
          <Route path="/reports" element={
            <DashboardLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Reports</h1>
                <p>This page is under construction.</p>
              </div>
            </DashboardLayout>
          } />
          <Route path="/settings" element={
            <DashboardLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Settings</h1>
                <p>This page is under construction.</p>
              </div>
            </DashboardLayout>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
