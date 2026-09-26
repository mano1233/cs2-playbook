import Link from "next/link";

export function TopBar({
  nickname,
  crumbs = [],
}: {
  nickname: string;
  crumbs?: { href?: string; label: string }[];
}) {
  return (
    <header className="topbar">
      <div className="inner">
        <Link href="/" className="brand">
          cs2 <span>playbook</span>
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            <span className="crumb-sep">/</span>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
        <div className="spacer" />
        <Link href="/keys" className="who-link">keys</Link>
        <div className="who">
          <span>signed in as</span> <strong>{nickname}</strong>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
