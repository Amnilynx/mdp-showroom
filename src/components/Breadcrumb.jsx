import { Link } from "react-router-dom";

// crumbs: [{ label, to }] — last item has no `to` (current page, not a link)
export default function Breadcrumb({ crumbs }) {
  return (
    <div className="breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i}>
          {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          {i < crumbs.length - 1 && <span className="breadcrumb-sep"> / </span>}
        </span>
      ))}
    </div>
  );
}