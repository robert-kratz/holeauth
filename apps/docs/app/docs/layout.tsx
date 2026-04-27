import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl='https://github.com/robert-kratz/holeauth'
      nav={{ title: 'holeauth' }}
      sidebar={{ defaultOpenLevel: 99 }}
    >
      {children}
    </DocsLayout>
  );
}
