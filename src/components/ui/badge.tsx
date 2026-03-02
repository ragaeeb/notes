import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-xs transition-colors',
    {
        defaultVariants: { variant: 'default' },
        variants: {
            variant: {
                default: 'border-transparent bg-muted text-fg',
                outline: 'border-edge text-fg-2',
                secondary: 'border-transparent bg-inverse text-fg-inverse',
            },
        },
    },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

const Badge = ({ className, variant, ...props }: BadgeProps) => {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
};

export { Badge, badgeVariants };
