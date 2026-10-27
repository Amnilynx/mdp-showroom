import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import FloatingChat from "./components/FloatingChat";
import SessionTimeout from "./components/SessionTimeout";

// Customer pages
import Homepage from "./pages/customer/Homepage";
import Login from "./pages/customer/Login";
import ForgotPassword from "./pages/customer/ForgotPassword";
import VerifyOtp from "./pages/customer/VerifyOtp";
import Register from "./pages/customer/Register";
import ShowroomChooseType from "./pages/customer/ShowroomChooseType";
import ShowroomBrowseList from "./pages/customer/ShowroomBrowseList";
import ShowroomCustomize from "./pages/customer/ShowroomCustomize";
import Portfolio from "./pages/customer/Portfolio";
import QuoteRequest from "./pages/customer/QuoteRequest";
import OrderTicket from "./pages/customer/OrderTicket";
import MyOrders from "./pages/customer/MyOrders";
import Privacy from "./pages/customer/Privacy";
import Profile from "./pages/customer/Profile";

// Admin pages
import AdminOverview from "./pages/admin/Overview";
import AdminOrdersList from "./pages/admin/OrdersList";
import AdminOrderDetail from "./pages/admin/OrderDetail";
import AdminInquiries from "./pages/admin/Inquiries";
import AdminShowroomList from "./pages/admin/ShowroomList";
import AdminShowroomForm from "./pages/admin/ShowroomForm";
import AdminCategoriesList from "./pages/admin/CategoriesList";
import AdminCategoryForm from "./pages/admin/CategoryForm";
import AdminImport from "./pages/admin/Import";
import AdminReports from "./pages/admin/Reports";
import AdminAccounts from "./pages/admin/Accounts";
import AdminPortfolioList from "./pages/admin/PortfolioList";
import AdminPortfolioForm from "./pages/admin/Portfolioform";

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
        <Routes>
          {/* Customer — public */}
          <Route path="/" element={<Homepage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/register" element={<Register />} />
          <Route path="/showroom" element={<ShowroomChooseType />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/showroom/:categoryId" element={<ShowroomBrowseList />} />
          <Route
            path="/showroom/:categoryId/:furnitureId/customize"
            element={<ShowroomCustomize />}
          />

          {/* Customer — auth required */}
          <Route
            path="/quote-request"
            element={
              <ProtectedRoute>
                <QuoteRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <MyOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute>
                <OrderTicket />
              </ProtectedRoute>
            }
          />

          {/* Admin — manager only */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="manager">
                <AdminOverview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute role="manager">
                <AdminOrdersList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders/:orderId"
            element={
              <ProtectedRoute role="manager">
                <AdminOrderDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/inquiries"
            element={
              <ProtectedRoute role="manager">
                <AdminInquiries />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/showroom"
            element={
              <ProtectedRoute role="manager">
                <AdminShowroomList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/showroom/add"
            element={
              <ProtectedRoute role="manager">
                <AdminShowroomForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/showroom/:furnitureId/edit"
            element={
              <ProtectedRoute role="manager">
                <AdminShowroomForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <ProtectedRoute role="manager">
                <AdminCategoriesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories/add"
            element={
              <ProtectedRoute role="manager">
                <AdminCategoryForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories/:categoryId/edit"
            element={
              <ProtectedRoute role="manager">
                <AdminCategoryForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/import"
            element={
              <ProtectedRoute role="manager">
                <AdminImport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute role="manager">
                <AdminReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/accounts"
            element={
              <ProtectedRoute role="manager">
                <AdminAccounts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/portfolio"
            element={
              <ProtectedRoute role="manager">
                <AdminPortfolioList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/portfolio/add"
            element={
              <ProtectedRoute role="manager">
                <AdminPortfolioForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/portfolio/:itemId/edit"
            element={
              <ProtectedRoute role="manager">
                <AdminPortfolioForm />
              </ProtectedRoute>
            }
          />
          <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
            }
          />
        </Routes>
        <FloatingChat />
        <SessionTimeout />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}