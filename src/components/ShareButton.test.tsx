import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import ShareButton from './ShareButton';

afterEach(() => {
    cleanup();
});

describe('ShareButton', () => {
    it('should display "Share" label by default', () => {
        render(<ShareButton isCopied={false} onShare={async () => undefined} />);

        expect(screen.getByText('Share')).toBeInTheDocument();
    });

    it('should display "Copied!" after click when prop updates', () => {
        const { rerender } = render(<ShareButton isCopied={false} onShare={async () => undefined} />);
        rerender(<ShareButton isCopied={true} onShare={async () => undefined} />);

        expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('should call share() when clicked', async () => {
        const onShare = mock(async () => undefined);
        render(<ShareButton isCopied={false} onShare={onShare} />);

        fireEvent.click(screen.getByTestId('share-button'));

        expect(onShare).toHaveBeenCalled();
    });

    it('should reflect label based on isCopied prop changes', () => {
        const { rerender } = render(<ShareButton isCopied={false} onShare={async () => undefined} />);
        expect(screen.getByText('Share')).toBeInTheDocument();

        rerender(<ShareButton isCopied={true} onShare={async () => undefined} />);
        expect(screen.getByText('Copied!')).toBeInTheDocument();

        rerender(<ShareButton isCopied={false} onShare={async () => undefined} />);
        expect(screen.getByText('Share')).toBeInTheDocument();
    });
});
