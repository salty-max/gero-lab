import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { InfoIcon } from 'lucide-react'

type SectionCardProps = {
  title: string
  description?: string
  className?: string
  children: React.ReactNode
  actions?: React.ReactNode
  info?: string
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
  info,
}: SectionCardProps) {
  return (
    <Card className={cn(className, 'pt-3 gap-2')}>
      <CardHeader>
        <div className="h-[34px] flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-gero">{title}</CardTitle>
            {info && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                      aria-label={`About ${title}`}
                    className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
                  >
                    <InfoIcon className="size-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{info}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {actions}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
