import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';

import LimitIndicator from './LimitIndicator';

describe('LimitIndicator', () => {
    it('should render green styling below 60%', () => {
        render(<LimitIndicator percent={50} />);
        const bar = screen.getByTestId('limit-indicator-bar');

        expect(bar.className.includes('bg-emerald-400')).toBe(true);
    });

    it('should render yellow styling between 60% and 85%', () => {
        render(<LimitIndicator percent={70} />);
        const bar = screen.getByTestId('limit-indicator-bar');

        expect(bar.className.includes('bg-amber-400')).toBe(true);
    });

    it('should render red styling above 85%', () => {
        render(<LimitIndicator percent={90} />);
        const bar = screen.getByTestId('limit-indicator-bar');

        expect(bar.className.includes('bg-red-500')).toBe(true);
    });

    it('should display the percentage value', () => {
        render(<LimitIndicator percent={42} />);

        expect(screen.getByText('42%')).toBeInTheDocument();
    });
});
