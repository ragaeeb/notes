import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-xs transition-colors',
    {
        defaultVariants: { variant: 'default' },
        variants: {
            variant: {
                default: 'border-transparent bg-slate-700 text-slate-100',
                outline: 'border-slate-700 text-slate-200',
                secondary: 'border-transparent bg-slate-200 text-slate-900',
            },
        },
    },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

const Badge = ({ className, variant, ...props }: BadgeProps) => {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
};

export { Badge, badgeVariants };
