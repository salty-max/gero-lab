export function Label({
  children,
  ...props
}: React.HTMLAttributes<HTMLLabelElement>) {
  return (
    <label className="text-sm opacity-70" {...props}>
      {children}
    </label>
  )
}
