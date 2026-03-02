import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

type ShareButtonProps = { onShare: () => Promise<void>; isCopied: boolean };

const ShareButton = ({ onShare, isCopied }: ShareButtonProps) => {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        data-testid="share-button"
                        onClick={() => {
                            onShare().catch(() => {});
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                    >
                        {isCopied ? 'Copied!' : 'Share'}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{isCopied ? 'URL copied to clipboard' : 'Generate and copy URL'}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ShareButton;
