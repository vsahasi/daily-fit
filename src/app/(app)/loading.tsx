import { Shell } from "@/components/shell";

export default function AppLoading() {
  return (
    <Shell>
      <div className="animate-pulse">
        <div className="mb-8 h-8 w-40 bg-snow" />
        <div className="mb-3 h-4 w-64 bg-snow" />
        <div className="grid grid-cols-1 gap-x-3 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <div className="aspect-[3/4] bg-snow" />
              <div className="mt-3 h-3 w-3/4 bg-snow" />
              <div className="mt-2 h-3 w-1/2 bg-snow" />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
