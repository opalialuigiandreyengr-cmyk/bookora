import * as React from "react"
import { cn } from "@/lib/utils"

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex w-full flex-col gap-3", className)} {...props} />
}
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="field" className={cn("flex w-full flex-col gap-1.5", className)} {...props} />
}
function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="field-label" className={cn("text-sm font-medium", className)} {...props} />
}
function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}
export { Field, FieldGroup, FieldLabel, FieldDescription }
