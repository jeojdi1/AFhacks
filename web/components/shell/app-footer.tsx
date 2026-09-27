import { c } from "@/lib/ui/copy"

/** Desktop footer (docs/ux-simplification.md §5.7): the short sentence, then the unchanged credits. */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted" data-app-footer>
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4 text-center text-[13px] leading-relaxed text-muted-foreground sm:px-6">
        <p className="mb-1 font-medium text-foreground">
          Muster · {c("app.tagline")}
        </p>
        <p className="font-medium text-slate-700">{c("footer.credits")}</p>
        <p>{c("footer.fine")}</p>
      </div>
    </footer>
  )
}
