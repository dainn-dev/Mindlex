// LU3 + LU4 — Legal news feed
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import type { NewsArticle } from "@/types";
import { Settings, Newspaper } from "lucide-react";

export function NewsFeedPage() {
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [usingDefault, setUsingDefault] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/news/feed")
      .then((r) => {
        setItems(r.data.items ?? []);
        setUsingDefault(!!r.data.usingDefaultTopics);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const openArticle = (a: NewsArticle) => {
    api.post(`/news/articles/${a.id}/read`).catch(() => undefined);
    window.open(a.sourceUrl, "_blank");
    setItems((curr) => curr.map((x) => (x.id === a.id ? { ...x, isUnread: false } : x)));
  };

  if (loading) {
    return <div className="p-7 text-slate-400">Loading...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] min-h-[calc(100vh-64px)]">
      <aside className="bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-xs font-semibold uppercase text-slate-400 px-2.5 py-2 tracking-wider">
          News
        </div>
        <Link to="/news" className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm bg-navy text-white">
          <Newspaper size={14} /> Feed
        </Link>
        <Link to="/news/topics" className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-slate-100">
          <Settings size={14} /> Topics
        </Link>
      </aside>
      <main className="p-4 md:p-7">
        <h1 className="font-display text-2xl text-navy">Legal news</h1>
        <p className="text-slate-500 text-sm mb-5">
          Personalized for your interests \u00b7 refreshed daily at 04:00 UTC
          {usingDefault && " \u00b7 Showing default Cyprus feed."}
        </p>
        {items.length === 0 ? (
          <EmptyState
            icon="\ud83d\udcf0"
            title="Nothing new on your topics today"
            description="We'll notify you the moment new articles match your interests."
            action={<Link to="/news/topics" className="btn-outline">Edit topics</Link>}
          />
        ) : (
          <div className="space-y-3.5">
            {items.map((a) => (
              <div
                key={a.id}
                onClick={() => openArticle(a)}
                className={`grid grid-cols-[80px_1fr_auto] gap-4 p-4 rounded-xl border cursor-pointer items-center ${
                  a.isUnread ? "bg-amber-50 border-l-4 border-gold" : "bg-white border-slate-200"
                }`}
              >
                <div className="bg-slate-100 rounded-md p-2.5 text-center">
                  <div className="text-2xl font-bold text-navy">
                    {new Date(a.publishedAt ?? Date.now()).getDate()}
                  </div>
                  <div className="text-[11px] uppercase text-slate-500">
                    {new Date(a.publishedAt ?? Date.now()).toLocaleString("en-US", { month: "short" })}
                  </div>
                </div>
                <div>
                  <h4 className="text-navy text-base">{a.headline}</h4>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{a.summary}</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {a.topics.map((t) => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
                {a.isUnread && <span className="chip-gold">Unread</span>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
