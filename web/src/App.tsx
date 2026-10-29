import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthGate } from './components/AuthGate.tsx';
import { Layout } from './components/Layout.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { InvitePage, LoginPage, SetupPage } from './pages/auth/AuthPages.tsx';
import { ContractorsPage } from './pages/ContractorsPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { MaintenancePage } from './pages/MaintenancePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProjectDetailPage } from './pages/project/ProjectDetailPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { RoomDetailPage } from './pages/RoomDetailPage.tsx';
import { RoomsPage } from './pages/RoomsPage.tsx';
import { SalePage } from './pages/SalePage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';

const router = createBrowserRouter([
  // Sidor som fungerar utan inloggning.
  { path: '/logga-in', element: <LoginPage /> },
  { path: '/forsta-start', element: <SetupPage /> },
  { path: '/inbjudan/:token', element: <InvitePage /> },
  {
    element: (
      <AuthGate>
        <Layout />
      </AuthGate>
    ),
    children: [
      { path: '/konto', element: <AccountPage /> },
      { path: '/', element: <DashboardPage /> },
      { path: '/projekt', element: <ProjectsPage /> },
      { path: '/projekt/:id', element: <ProjectDetailPage /> },
      { path: '/rum', element: <RoomsPage /> },
      { path: '/rum/:id', element: <RoomDetailPage /> },
      { path: '/sok', element: <SearchPage /> },
      { path: '/utgifter', element: <ExpensesPage /> },
      { path: '/underhall', element: <MaintenancePage /> },
      { path: '/hantverkare', element: <ContractorsPage /> },
      { path: '/rapport', element: <ReportPage /> },
      { path: '/forsaljning', element: <SalePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
