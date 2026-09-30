import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

type ShareButtonProps = { onShare: () => Promise<void>; isCopied: boolean; isPreparing?: boolean };

const ShareButton = ({ onShare, isCopied, isPreparing = false }: ShareButtonProps) => {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        data-testid="share-button"
                        disabled={isPreparing}
                        aria-busy={isPreparing}
                        onClick={() => {
                            onShare().catch(() => {});
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                    >
                        {isPreparing ? 'Preparing…' : isCopied ? 'Copied!' : 'Share'}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{isCopied ? 'URL copied to clipboard' : 'Generate and copy URL'}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ShareButton;
