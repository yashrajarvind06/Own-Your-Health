import { Route, Routes, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout";
import HowItWorks from "./components/HowItWorks";
import KeyFeatures from "./components/KeyFeatures";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import PatientHistory from "./pages/PatientHistory";
import PhoneLogin from "./pages/PhoneLogin";

// ...

<Route path="/patient/history" element={
  <ProtectedRoute allowedRoles={['patient']}>
    <PatientHistory />
  </ProtectedRoute>
} />
import DoctorAccessHistory from "./pages/DoctorAccessHistory";
import ProfilePage from "./pages/ProfilePage";
import EmergencyProfile from "./pages/EmergencyProfile";
import MyRecords from "./pages/MyRecords";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Button } from "./components/ui/Button";

import ProtectedRoute from "./components/ProtectedRoute";

function Landing() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>; // Or a simple spinner

  if (user) {
    if (user.role === "patient") return <Navigate to="/patient" />;
    if (user.role === "doctor") return <Navigate to="/doctor" />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden bg-gradient-to-b from-blue-50/50 via-white to-white">
        {/* Abstract Background Shape */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none z-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute top-20 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            The Future of Medical Records
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-8 leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700">
            Your Health Records, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              Under Your Control
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-xl text-gray-600 mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Securely store, manage, and share your medical history with doctors using
            advanced QR technology. Blockchain-backed privacy for total peace of mind.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
            <Link to="/register">
              <Button size="xl" className="shadow-lg shadow-blue-500/20 px-8 text-lg h-14 bg-blue-600 hover:bg-blue-700 transition-all hover:scale-105">
                Get Started Now
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="xl" className="px-8 text-lg h-14 bg-white hover:bg-gray-50 text-gray-700 border-gray-200 transition-all hover:scale-105">
                I have an account
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full -mt-12 md:-mt-20">
        <KeyFeatures />
      </div>

      <div className="relative z-10 w-full">
        <HowItWorks />
      </div>

      {/* Trust Footer/Banner removed to avoid duplication */}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/phone" element={<PhoneLogin />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Role-Based Routes */}
          <Route path="/patient" element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientDashboard />
            </ProtectedRoute>
          } />


          <Route path="/patient/history" element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientHistory />
            </ProtectedRoute>
          } />
          <Route path="/patient/emergency-profile" element={
            <ProtectedRoute allowedRoles={['patient']}>
              <EmergencyProfile />
            </ProtectedRoute>
          } />
          <Route path="/patient/records" element={
            <ProtectedRoute allowedRoles={['patient']}>
              <MyRecords />
            </ProtectedRoute>
          } />
          <Route path="/doctor" element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/doctor/logs" element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorAccessHistory />
            </ProtectedRoute>
          } />

          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

