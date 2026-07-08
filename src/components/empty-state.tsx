import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Action = {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
};

export function EmptyState({
  icon,
  title = "暂无数据",
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  icon: ReactNode;
  title?: string;
  description: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  compact?: boolean;
}) {
  const content = (
    <div className="flex min-h-40 flex-col items-center justify-center text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-primary">
        {icon}
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {primaryAction && <ActionButton action={primaryAction} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );

  if (compact) {
    return <div className="rounded-lg border border-dashed border-border/70 p-4">{content}</div>;
  }

  return <Card className="border-border/60 bg-card/60 p-6 backdrop-blur">{content}</Card>;
}

function ActionButton({ action, variant }: { action: Action; variant?: "outline" }) {
  if (action.href) {
    return (
      <Button asChild variant={variant}>
        <a href={action.href}>
          {action.icon}
          {action.label}
        </a>
      </Button>
    );
  }

  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.icon}
      {action.label}
    </Button>
  );
}
