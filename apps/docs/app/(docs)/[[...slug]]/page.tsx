import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { source } from '@/lib/source';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const title = page.data.title;
  const description = page.data.description as string | undefined;

  const ogUrl =
    `/api/og?title=${encodeURIComponent(title)}` +
    (description ? `&description=${encodeURIComponent(description)}` : '');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;

  // Redirect bare / → /getting-started (docs landing page on the subdomain).
  if (!slug || slug.length === 0) {
    redirect('/getting-started');
  }

  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
