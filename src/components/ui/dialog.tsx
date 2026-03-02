import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '../../lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
    return <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-black/70', className)} ref={ref} {...props} />;
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => {
    return (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
                className={cn(
                    'fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-edge bg-surface p-6 text-fg shadow-lg',
                    className,
                )}
                ref={ref}
                {...props}
            />
        </DialogPortal>
    );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
    return <div className={cn('space-y-2 text-left', className)} {...props} />;
};

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
    return <div className={cn('flex justify-end', className)} {...props} />;
};

const DialogTitle = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
    return <DialogPrimitive.Title className={cn('font-semibold text-lg', className)} ref={ref} {...props} />;
});
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
    return <DialogPrimitive.Description className={cn('text-fg-3 text-sm', className)} ref={ref} {...props} />;
});
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
};
