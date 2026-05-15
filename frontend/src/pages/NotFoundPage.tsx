import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="font-display text-7xl text-gold">404</div>
        <h2 className="font-display text-2xl text-navy mt-2">Page not found</h2>
        <p className="text-slate-500 text-sm mt-1 mb-4">
          The page you were looking for doesn't exist or has moved.
        </p>
        <Link to="/" className="btn-primary inline-flex">← Back home</Link>
      </div>
    </div>
  );
}
