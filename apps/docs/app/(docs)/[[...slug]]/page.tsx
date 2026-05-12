import { notFound, redirect } from 'next/navigation';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { source } from '@/lib/source';

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
