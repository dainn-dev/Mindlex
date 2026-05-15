import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";

import { useAuthStore } from "@/store/authStore";
import { ToastHost } from "@/components/ui/Toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Layouts
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { AppLayout } from "@/components/layouts/AppLayout";
import { AccountLayout } from "@/components/layouts/AccountLayout";
import { AdminLayout } from "@/components/layouts/AdminLayout";

// Pages
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { EmailVerifyPage } from "@/pages/EmailVerifyPage";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ChatbotPage } from "@/pages/ChatbotPage";
import { NewsFeedPage } from "@/pages/NewsFeedPage";
import { NewsTopicsPage } from "@/pages/NewsTopicsPage";
import { DrivePage } from "@/pages/DrivePage";
import { MyAccountPage } from "@/pages/account/MyAccountPage";
import { SubscriptionPage } from "@/pages/account/SubscriptionPage";
import {
  CheckoutPage, CheckoutSuccessPage, CheckoutCancelPage
} from "@/pages/account/CheckoutPage";
import { BillingPage } from "@/pages/account/BillingPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminSubscriptionsPage } from "@/pages/admin/AdminSubscriptionsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function App() {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  useEffect(() => { refreshUser(); }, [refreshUser]);

  return (
    <BrowserRouter>
      <ToastHost />
      <Routes>
        {/* Public routes — wrapped in PublicLayout for marketing pages */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
        </Route>

        {/* Standalone auth pages (own background, no public layout) */}
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<EmailVerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Checkout result pages — standalone */}
        <Route path="/checkout/success" element={
          <ProtectedRoute><CheckoutSuccessPage /></ProtectedRoute>
        } />
        <Route path="/checkout/cancel" element={
          <ProtectedRoute><CheckoutCancelPage /></ProtectedRoute>
        } />

        {/* Authenticated app routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
          <Route path="/news" element={<NewsFeedPage />} />
          <Route path="/news/topics" element={<NewsTopicsPage />} />
          <Route path="/drive" element={<DrivePage />} />
          <Route path="/checkout" element={<CheckoutPage />} />

          {/* Account section with its own sidebar layout */}
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<Navigate to="/account/profile" replace />} />
            <Route path="profile" element={<MyAccountPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="privacy" element={<MyAccountPage />} />
          </Route>

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["Admin"]}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
