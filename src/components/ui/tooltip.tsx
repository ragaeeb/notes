import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
    React.ComponentRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                className={cn('z-50 rounded-md bg-inverse px-2 py-1 text-fg-inverse text-xs shadow-lg', className)}
                ref={ref}
                sideOffset={sideOffset}
                {...props}
            />
        </TooltipPrimitive.Portal>
    );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
