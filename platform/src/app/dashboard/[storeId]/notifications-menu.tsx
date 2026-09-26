"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { markNotificationsReadAction } from "./notifications-actions";

const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" });

export function NotificationsMenu({
  storeId,
  unread,
  items,
}: {
  storeId: string;
  unread: number;
  items: { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }[];
}) {
  const [, start] = useTransition();
  return (
    <details
      className="relative"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && unread > 0) start(() => markNotificationsReadAction(storeId));
      }}
    >
      <summary className="relative flex cursor-pointer list-none items-center rounded-xl p-2 hover:bg-muted" aria-label={`الإشعارات${unread ? ` (${unread} غير مقروءة)` : ""}`}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">{unread}</span>}
      </summary>
      <div className="absolute end-0 z-30 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg">
        <p className="px-2 py-1 text-sm font-semibold">الإشعارات</p>
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ink-soft">لا توجد إشعارات.</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((n) => {
              const body = (
                <>
                  <p className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-ink-soft">{n.body}</p>}
                  <p className="text-[11px] text-ink-faint">{fmt.format(new Date(n.createdAt))}</p>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block rounded-lg px-2 py-2 hover:bg-muted">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
