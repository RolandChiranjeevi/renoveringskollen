import { Link } from 'react-router';
import { EmptyState } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <EmptyState title="Sidan hittades inte">
      <Link to="/" className="text-brand-700 hover:underline">
        Till översikten
      </Link>
    </EmptyState>
  );
}
