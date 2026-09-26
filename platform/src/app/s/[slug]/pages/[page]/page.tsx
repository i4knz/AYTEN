import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage, parseBody } from "@/server/design/pages";
import { decodeParam, loadStorefront } from "../../data";

async function load(params: PageProps<"/s/[slug]/pages/[page]">["params"]) {
  const { slug, page } = await params;
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return null;
  return getPublicPage(store.id, decodeParam(page));
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]/pages/[page]">): Promise<Metadata> {
  const page = await load(params);
  return page ? { title: page.title } : {};
}

export default async function ContentPage({ params }: PageProps<"/s/[slug]/pages/[page]">) {
  const page = await load(params);
  if (!page) notFound();
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 leading-8">
      <h1 className="text-3xl font-bold">{page.title}</h1>
      {parseBody(page.body).map((b, i) =>
        b.type === "h" ? (
          <h2 key={i} className="mt-2 text-xl font-semibold">{b.text}</h2>
        ) : b.type === "ul" ? (
          <ul key={i} className="list-disc ps-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        ) : b.type === "ol" ? (
          <ol key={i} className="list-decimal ps-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
        ) : (
          <p key={i} className="whitespace-pre-line text-ink-soft">{b.text}</p>
        ),
      )}
    </article>
  );
}
