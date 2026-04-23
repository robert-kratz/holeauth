import { Skeleton } from './skeleton';

export function HomeSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <ul className="space-y-2 pl-6">
        <li><Skeleton className="h-4 w-40" /></li>
        <li><Skeleton className="h-4 w-32" /></li>
        <li><Skeleton className="h-4 w-36" /></li>
      </ul>
    </div>
  );
}
